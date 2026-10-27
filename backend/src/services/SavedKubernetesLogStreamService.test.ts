import { jest, expect, it, beforeEach, afterEach } from '@jest/globals';
import { PassThrough } from 'node:stream';
import type { Server, Socket } from 'socket.io';
import { SavedKubernetesLogStreamService } from './SavedKubernetesLogStreamService';
import { KubernetesLogSources, resolveLogPods } from './KubernetesLogSources';
import { getSocketUser, canAccessKubernetesNamespace } from '../middleware/auth';
import { RbacRoleService } from './RbacRoleService';
import { IngestionBufferService } from './IngestionBufferService';
import * as k8s from '@kubernetes/client-node';

jest.mock('./KubernetesLogSources', () => ({ KubernetesLogSources: { list: jest.fn() }, resolveLogPods: jest.fn() }));
jest.mock('../middleware/auth', () => ({ getSocketUser: jest.fn(), canAccessKubernetesNamespace: jest.fn() }));
jest.mock('./RbacRoleService', () => ({ RbacRoleService: { hasPermission: jest.fn() } }));
jest.mock('./KubernetesService', () => ({ KubernetesService: { getInstance: () => ({ getKubeConfig: () => ({}) }) } }));
jest.mock('./IngestionBufferService', () => ({ IngestionBufferService: { getInstance: jest.fn() } }));
jest.mock('@kubernetes/client-node', () => ({ Log: jest.fn() }));
jest.mock('../database/DatabaseFactory', () => ({ DatabaseFactory: { isLogStorageSupported: () => true } }));
const authUser = { id: 'fixture', username: 'fixture', preferred_username: 'fixture', role: 'kubiq-admin', roles: ['kubiq-admin'], type: 'native' as const };
const logMock = k8s.Log as unknown as ReturnType<typeof jest.fn<() => unknown>>;
const source = { id: 'saved', name: 'Web', namespace: 'apps', kind: 'service' as const, resource: 'web', updatedAt: 1 };
const pod = (uid = 'uid', restartCount = 0) => ({ metadata: { name: 'web-abc-xyz', uid }, spec: { containers: [{ name: 'web' }, { name: 'sidecar' }] }, status: { containerStatuses: [{ name: 'web', restartCount, image: 'fixture', imageID: 'fixture', ready: true }] } });
let connect: (socket: Socket) => void;
let streams: Array<{ stream: PassThrough; options: k8s.LogOptions; abort: ReturnType<typeof jest.fn> }>;
const ingest = jest.fn();
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
function socket(id = 'socket') {
    const handlers = new Map<string, (data?: unknown) => void>();
    const emit = jest.fn();
    const value = { id, handshake: { auth: { token: 'fixture' } }, on: (name: string, handler: (data?: unknown) => void) => handlers.set(name, handler), emit, volatile: { emit } };
    connect(value as unknown as Socket);
    return { handlers, emit, start: (data: unknown = { sourceId: 'saved', namespace: 'forged' }) => handlers.get('k8s:watch:source')!(data), stop: () => handlers.get('disconnect')!() };
}
beforeEach(() => {
    jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-27T23:59:59Z')); streams = []; ingest.mockClear();
    jest.mocked(KubernetesLogSources.list).mockReset().mockResolvedValue([source]);
    jest.mocked(resolveLogPods).mockReset().mockResolvedValue([pod()]);
    jest.mocked(getSocketUser).mockReset().mockResolvedValue(authUser);
    jest.mocked(canAccessKubernetesNamespace).mockReset().mockResolvedValue(true);
    jest.mocked(RbacRoleService.hasPermission).mockReset().mockResolvedValue(true);
    jest.mocked(IngestionBufferService.getInstance).mockReturnValue({ ingestLines: ingest } as unknown as IngestionBufferService);
    logMock.mockImplementation(() => ({ log: (_ns: string, _pod: string, _container: string, stream: PassThrough, options: k8s.LogOptions) => {
        const abort = jest.fn(); streams.push({ stream, options, abort }); return Promise.resolve({ abort });
    } }) as unknown as k8s.Log);
    new SavedKubernetesLogStreamService({ on: (_name: string, handler: typeof connect) => { connect = handler; } } as unknown as Server);
});
afterEach(() => { jest.useRealTimers(); });
it('streams labeled complete UTF8 lines from the saved target and bounds/redacts no business content implicitly', async () => {
    const client = socket(); client.start(); await flush();
    expect(streams).toHaveLength(2);
    expect(canAccessKubernetesNamespace).toHaveBeenCalledWith(expect.anything(), 'apps');
    const bytes = Buffer.from('2026-10-28T00:00:00.123Z hello 🌍\n');
    streams[0].stream.write(bytes.subarray(0, bytes.length - 3)); streams[0].stream.write(bytes.subarray(bytes.length - 3));
    expect(client.emit).toHaveBeenCalledWith('k8s:log:line', { content: '[apps/web-abc-xyz/web] 2026-10-28T00:00:00.123Z hello 🌍\n' });
    expect(ingest).toHaveBeenCalledWith('k8s:apps:saved', 'pod:web-abc-xyz:web', expect.any(Array));
    streams[0].stream.write('x'.repeat(70000));
    streams[0].stream.end(); await flush();
    client.stop(); expect(streams.every(item => item.stream.destroyed)).toBe(true);
});
it('follows new pod identities and container restarts, aborting stale streams', async () => {
    const client = socket(); client.start(); await flush();
    jest.mocked(resolveLogPods).mockResolvedValue([pod('replacement', 1)]);
    await jest.advanceTimersByTimeAsync(10000);
    expect(streams).toHaveLength(4); expect(streams[0].abort).toHaveBeenCalled();
    client.stop(); expect(streams[3].abort).toHaveBeenCalled();
});
it('retries ended streams from their timestamp without duplicating replayed lines', async () => {
    const client = socket(); client.start(); await flush();
    streams[0].stream.end('2026-10-28T00:00:00.123Z first\n'); await flush();
    await jest.advanceTimersByTimeAsync(10000);
    const retry = streams[2]; expect(retry.options.sinceTime).toBe('2026-10-28T00:00:00.123000000Z');
    client.emit.mockClear(); retry.stream.write('2026-10-28T00:00:00.123Z first\n2026-10-28T00:00:00.124Z next\n');
    expect(client.emit).toHaveBeenCalledWith('k8s:log:line', expect.objectContaining({ content: expect.stringContaining('next') }));
    expect(JSON.stringify(client.emit.mock.calls)).not.toContain('first'); client.stop();
});
it.each(['permission', 'namespace', 'missing', 'changed'])('fails closed on %s revocation during an active stream', async mode => {
    const client = socket(); client.start(); await flush();
    if (mode === 'permission') jest.mocked(RbacRoleService.hasPermission).mockResolvedValue(false);
    if (mode === 'namespace') jest.mocked(canAccessKubernetesNamespace).mockResolvedValue(false);
    if (mode === 'missing') jest.mocked(KubernetesLogSources.list).mockResolvedValue([]);
    if (mode === 'changed') jest.mocked(KubernetesLogSources.list).mockResolvedValue([{ ...source, updatedAt: 2 }]);
    await jest.advanceTimersByTimeAsync(10000);
    expect(client.emit).toHaveBeenCalledWith('k8s:log:error', expect.any(Object));
    expect(streams[0].abort).toHaveBeenCalled(); client.stop();
});
it('waits for scale-from-zero and selects only an explicitly configured container', async () => {
    jest.mocked(resolveLogPods).mockResolvedValue([]);
    jest.mocked(KubernetesLogSources.list).mockResolvedValue([{ ...source, container: 'web' }]);
    const client = socket(); client.start(); await flush();
    expect(client.emit).toHaveBeenCalledWith('k8s:log:status', expect.objectContaining({ waiting: true }));
    jest.mocked(resolveLogPods).mockResolvedValue([pod()]); await jest.advanceTimersByTimeAsync(10000);
    expect(streams).toHaveLength(1); client.stop();
});
it('rejects invalid requests, expired authentication and overly broad targets', async () => {
    const client = socket(); client.start(null); client.start({ sourceId: 'saved', tailLines: 501 });
    expect(streams).toHaveLength(0);
    jest.mocked(getSocketUser).mockResolvedValue(null); client.start(); await flush(); expect(streams).toHaveLength(0);
    jest.mocked(getSocketUser).mockResolvedValue(authUser);
    jest.mocked(resolveLogPods).mockResolvedValue(Array.from({ length: 11 }, (_, index) => pod(String(index))));
    client.start(); await flush(); expect(streams).toHaveLength(0); expect(client.emit).toHaveBeenCalledWith('k8s:log:error', { message: expect.stringContaining('20') }); client.stop();
});
it('does not attach or leak a stream when disconnected during an async authorization', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof getSocketUser>>) => void;
    jest.mocked(getSocketUser).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const client = socket(); client.start(); await flush(); client.stop(); resolve(authUser); await flush(); expect(streams).toHaveLength(0);
});
it('reports transport failures as waiting and aborts a handle that arrives after cancellation', async () => {
    let resolve!: (value: AbortController) => void;
    logMock.mockImplementation(() => ({ log: () => new Promise(done => { resolve = done; }) }) as unknown as k8s.Log);
    const client = socket(); client.start(); await flush(); client.stop();
    const abort = jest.fn(); resolve({ abort } as unknown as AbortController); await flush(); expect(abort).toHaveBeenCalled();
    logMock.mockImplementation(() => ({ log: async () => { throw new Error('private transport details'); } }) as unknown as k8s.Log);
    client.start(); await flush(); expect(client.emit).toHaveBeenCalledWith('k8s:log:status', expect.objectContaining({ waiting: true })); client.stop();
});
