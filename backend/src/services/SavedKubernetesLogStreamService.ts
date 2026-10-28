import type { Server, Socket } from 'socket.io';
import { PassThrough } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { createHash } from 'node:crypto';
import * as k8s from '@kubernetes/client-node';
import { getSocketUser, canAccessKubernetesNamespace } from '../middleware/auth';
import { RbacRoleService } from './RbacRoleService';
import { defaultLogKubeConfig, KubernetesLogSources, resolveLogPods } from './KubernetesLogSources';
import { IngestionBufferService } from './IngestionBufferService';
import type { KubernetesLogSource } from '../database/interfaces/ISystemRepository';
import { DatabaseFactory } from '../database/DatabaseFactory';

interface Follow { stream: PassThrough; handle?: AbortController; stamp: string; hashes: Set<string>; ended: boolean; completed?: boolean; pending: string }
interface Subscription { socket: Socket; sourceId: string; source?: KubernetesLogSource; tail: number; startedAt: number; active: boolean; busy: boolean; timer?: NodeJS.Timeout; discoveryAbort?: AbortController; streams: Map<string, Follow> }
function logTimestamp(line: string): string {
    const space = line.indexOf(' ');
    const recorded = line.slice(0, space);
    if (space < 0 || recorded.length > 40 || !recorded.includes('T') || !recorded.endsWith('Z') || !Number.isFinite(Date.parse(recorded))) return '';
    const [clock, fraction = ''] = recorded.slice(0, -1).split('.');
    return `${clock}.${fraction.padEnd(9, '0')}Z`;
}
export class SavedKubernetesLogStreamService {
    private readonly subscriptions = new Map<string, Subscription>();
    private readonly persisted = new Map<string, number>();
    constructor(io: Server) {
        io.on('connection', socket => {
            socket.on('k8s:watch:source', data => {
                this.stop(socket.id);
                if (!data || typeof data.sourceId !== 'string' || data.sourceId.length > 80) return socket.emit('k8s:log:error', { message: 'Choose a saved Kubernetes log source.' });
                const tail = Number(data.tailLines ?? 100);
                if (!Number.isInteger(tail) || tail < 1 || tail > 500) return socket.emit('k8s:log:error', { message: 'Tail must be between 1 and 500 lines.' });
                const sub: Subscription = { socket, sourceId: data.sourceId, tail, startedAt: Date.now(), active: true, busy: false, streams: new Map() };
                this.subscriptions.set(socket.id, sub);
                socket.emit('k8s:log:init', { lines: [] });
                void this.reconcile(sub);
                sub.timer = setInterval(() => { void this.reconcile(sub); }, 10000);
            });
            socket.on('k8s:stop:logs', () => this.stop(socket.id));
            socket.on('k8s:watch:logs', () => this.stop(socket.id));
            socket.on('disconnect', () => this.stop(socket.id));
        });
    }
    private async authorize(sub: Subscription) {
        const user = await getSocketUser(sub.socket.handshake.auth?.token);
        for (const permission of ['logs.read', 'kubernetes.read']) {
            if (!user || !(await RbacRoleService.hasPermission(user, permission))) throw new Error('Your kubiq role does not permit Kubernetes log streaming.');
        }
        return user;
    }
    private async reconcile(sub: Subscription): Promise<void> {
        if (!sub.active || sub.busy) return;
        sub.busy = true;
        try {
            const user = await this.authorize(sub);
            if (!sub.active) return;
            const source = (await KubernetesLogSources.list()).find(item => item.id === sub.sourceId);
            if (!source) throw new Error('This log source was removed.');
            if (!(await canAccessKubernetesNamespace(user, source.namespace))) throw new Error('Access denied to this namespace.');
            if (!sub.active) return;
            if (sub.source && sub.source.updatedAt !== source.updatedAt) throw new Error('Log configuration changed. Reopen this source to reconnect.');
            sub.source = source;
            sub.discoveryAbort = new AbortController();
            const pods = await resolveLogPods(source, undefined, AbortSignal.any([sub.discoveryAbort.signal, AbortSignal.timeout(8000)]));
            sub.discoveryAbort = undefined;
            if (!sub.active) return;
            const targets = pods.flatMap(pod => (pod.spec?.containers || []).filter(container => !source.container || container.name === source.container).map(container => ({
                pod: pod.metadata?.name || '', container: container.name, terminal: pod.status?.phase === 'Succeeded' || pod.status?.phase === 'Failed',
                key: `${pod.metadata?.uid || pod.metadata?.name}:${container.name}:${pod.status?.containerStatuses?.find(item => item.name === container.name)?.restartCount || 0}`,
            })));
            this.synchronize(sub, targets);
        } catch (error) {
            if (sub.active) { sub.socket.emit('k8s:log:error', { message: this.safeError(error) }); this.stop(sub.socket.id); }
        } finally { sub.busy = false; }
    }
    private synchronize(sub: Subscription, targets: Array<{ key: string; pod: string; container: string; terminal?: boolean }>) {
        if (targets.length > 20) throw new Error('More than 20 container streams match. Narrow the workload or container selection.');
        const wanted = new Set(targets.map(target => target.key));
        for (const [key, follow] of sub.streams) if (!wanted.has(key)) { this.close(follow); sub.streams.delete(key); }
        for (const target of targets) {
            if (!sub.active) return;
            const existing = sub.streams.get(target.key);
            if (existing && (!existing.ended || existing.completed)) continue;
            if (this.streamCount() >= 100) throw new Error('Kubernetes log stream capacity reached. Close another viewer and retry.');
            this.follow(sub, target, existing);
        }
        const connected = [...sub.streams.values()].some(follow => follow.handle && !follow.ended);
        if (targets.length && this.completionStatus(sub)) return;
        sub.socket.emit('k8s:log:status', { waiting: !connected, message: targets.length ? 'Connecting to container logs…' : 'Waiting for matching pods. Discovery retries every 10 seconds.' });
    }
    private completionStatus(sub: Subscription): boolean {
        const completed = sub.streams.size > 0 && [...sub.streams.values()].every(follow => follow.completed);
        if (completed) sub.socket.emit('k8s:log:status', { waiting: false, ended: true, message: 'Completed container logs loaded.' });
        return completed;
    }
    private streamCount() { return [...this.subscriptions.values()].reduce((sum, sub) => sum + [...sub.streams.values()].filter(item => !item.ended).length, 0); }
    private safeError(error: unknown) {
        if (error instanceof Error && !('statusCode' in error) && !('response' in error)) return error.message.slice(0, 200);
        return 'Kubernetes logs unavailable. Check the target and Kubernetes API permissions.';
    }
    private follow(sub: Subscription, target: { key: string; pod: string; container: string; terminal?: boolean }, previous?: Follow) {
        const stream = new PassThrough();
        const decoder = new StringDecoder('utf8');
        const follow: Follow = { stream, stamp: previous?.stamp || '', hashes: previous?.hashes || new Set(), ended: false, pending: '' };
        sub.streams.set(target.key, follow);
        stream.on('data', (chunk: Buffer) => {
            if (!sub.active) return;
            follow.pending += decoder.write(chunk);
            const lines = follow.pending.split('\n');
            follow.pending = lines.pop() || '';
            if (follow.pending.length > 65536) follow.pending = '[Oversized log line truncated]';
            this.deliver(sub, target, follow, lines);
        });
        const ended = (completed = false) => {
            if (follow.ended) return;
            follow.ended = true;
            if (sub.active) this.deliver(sub, target, follow, [follow.pending + decoder.end()].filter(Boolean));
            follow.pending = '';
            if (sub.active && target.terminal && completed) { follow.completed = true; this.completionStatus(sub); }
        };
        stream.once('end', () => ended(true));
        stream.once('error', () => ended());
        stream.once('close', () => ended());
        const options: k8s.LogOptions = { follow: !target.terminal, timestamps: true, tailLines: sub.tail };
        if (target.terminal) options.limitBytes = 262144;
        if (follow.stamp) { options.sinceTime = follow.stamp; delete options.tailLines; }
        new k8s.Log(defaultLogKubeConfig()).log(sub.source!.namespace, target.pod, target.container, stream, options)
            .then(handle => {
                if (!sub.active || follow.ended) handle.abort();
                else { follow.handle = handle; sub.socket.emit('k8s:log:status', { waiting: false, message: 'Following container logs' }); }
            })
            .catch(() => { ended(); stream.destroy(); if (sub.active) sub.socket.emit('k8s:log:status', { waiting: true, message: 'A container stream is unavailable; retrying discovery.' }); });
    }
    private acceptLine(follow: Follow, line: string): { stamp: string; hash: string } | null {
        if (!line) return null;
        const stamp = logTimestamp(line);
        const hash = createHash('sha256').update(line).digest('hex');
        if (stamp && (stamp < follow.stamp || (stamp === follow.stamp && follow.hashes.has(hash)))) return null;
        if (stamp > follow.stamp) { follow.stamp = stamp; follow.hashes.clear(); }
        if (follow.hashes.size < 100) follow.hashes.add(hash);
        return { stamp, hash };
    }
    private freshRecord(sub: Subscription, identity: string, stamp: string): boolean {
        if (Date.parse(stamp) < sub.startedAt || !stamp || this.persisted.has(identity)) return false;
        this.persisted.set(identity, Date.now());
        return true;
    }
    private deliver(sub: Subscription, target: { pod: string; container: string; terminal?: boolean }, follow: Follow, lines: string[]) {
        const accepted: string[] = [];
        const fresh: string[] = [];
        for (const line of lines) {
            const record = this.acceptLine(follow, line);
            if (!record) continue;
            const labeled = `[${sub.source!.namespace}/${target.pod}/${target.container}] ${line.slice(0, 8192)}`;
            accepted.push(labeled);
            const identity = `${sub.sourceId}:${target.pod}:${target.container}:${record.hash}`;
            if (this.freshRecord(sub, identity, record.stamp)) fresh.push(labeled);
        }
        if (!accepted.length || !sub.active) return;
        // Bounded packets and the ingestion service's existing bounded queue prevent a slow viewer growing memory.
        const output = target.terminal ? sub.socket : sub.socket.volatile;
        for (let index = 0; index < accepted.length; index += 25) output.emit('k8s:log:line', { content: accepted.slice(index, index + 25).join('\n') + '\n' });
        while (this.persisted.size > 8192) this.persisted.delete(this.persisted.keys().next().value!);
        if (fresh.length && DatabaseFactory.isLogStorageSupported()) IngestionBufferService.getInstance().ingestLines(`k8s:${sub.source!.namespace}:${sub.sourceId}`, `pod:${target.pod}:${target.container}`, fresh);
    }
    private close(follow: Follow) { follow.ended = true; follow.handle?.abort(); follow.stream.destroy(); }
    private stop(id: string) {
        const sub = this.subscriptions.get(id);
        if (!sub) return;
        sub.active = false;
        sub.discoveryAbort?.abort();
        clearInterval(sub.timer);
        for (const follow of sub.streams.values()) this.close(follow);
        sub.streams.clear();
        this.subscriptions.delete(id);
    }
}
