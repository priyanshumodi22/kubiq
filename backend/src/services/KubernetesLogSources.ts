import * as k8s from '@kubernetes/client-node';
import { randomUUID } from 'node:crypto';
import { DatabaseFactory } from '../database/DatabaseFactory';
import type { KubernetesLogSource } from '../database/interfaces/ISystemRepository';
import { KubernetesService } from './KubernetesService';

const kinds = new Set(['service', 'deployment', 'statefulset', 'daemonset', 'replicaset', 'job', 'cronjob', 'replicationcontroller', 'pod', 'namespace']);
const dns = /^[a-z0-9](?:[-a-z0-9.]{0,251}[a-z0-9])?$/;
export function defaultLogKubeConfig(): k8s.KubeConfig {
    const service = KubernetesService.getInstance();
    const base = service.getKubeConfig();
    const config = new k8s.KubeConfig();
    config.loadFromOptions({ clusters: [...base.clusters], users: [...base.users], contexts: [...base.contexts], currentContext: service.defaultContext });
    return config;
}
export function logRequestOptions(signal = AbortSignal.timeout(8000)): k8s.ConfigurationOptions {
    const middleware = k8s.createConfiguration({ promiseMiddleware: [{ pre: async context => { context.setSignal(signal); return context; }, post: async context => context }] }).middleware;
    return { middleware, middlewareMergeStrategy: 'append' };
}
export function parseLogSource(value: unknown, id: string = randomUUID()): KubernetesLogSource {
    if (!value || typeof value !== 'object') throw new Error('Choose a Kubernetes log target.');
    const input = value as Record<string, unknown>;
    const text = (key: string) => typeof input[key] === 'string' ? String(input[key]).trim() : '';
    const name = text('name'), namespace = text('namespace'), kind = text('kind'), resource = text('resource'), container = text('container');
    if (!name || name.length > 80 || [...name].some(character => character.codePointAt(0)! < 32)) throw new Error('Enter a label of up to 80 characters.');
    if (!dns.test(namespace) || namespace.length > 63 || !kinds.has(kind)) throw new Error('Choose a valid namespace and resource type.');
    if (kind !== 'namespace' && !dns.test(resource)) throw new Error('Choose a valid Kubernetes resource.');
    if (container && (!dns.test(container) || container.length > 63)) throw new Error('Choose a valid container.');
    return { id, name, namespace, kind: kind as KubernetesLogSource['kind'], resource: kind === 'namespace' ? namespace : resource, container: container || undefined, updatedAt: Date.now() };
}
export class KubernetesLogSources {
    private static queue: Promise<unknown> = Promise.resolve();
    static async list(): Promise<KubernetesLogSource[]> {
        const repo = await DatabaseFactory.getSystemRepository();
        return (await repo.getKubernetesLogConfig())?.sources || [];
    }
    static async change(id: string, source?: KubernetesLogSource): Promise<void> {
        const operation = this.queue.then(async () => {
            const repo = await DatabaseFactory.getSystemRepository();
            const sources = (await this.list()).filter(item => item.id !== id);
            if (source) sources.push(source);
            if (sources.length > 100) throw new Error('Maximum 100 saved Kubernetes log sources.');
            await repo.saveKubernetesLogConfig({ version: 1, sources, updatedAt: Date.now() });
        });
        this.queue = operation.catch(() => undefined);
        await operation;
    }
}
export function selectorText(selector?: k8s.V1LabelSelector): string {
    const labels = Object.entries(selector?.matchLabels || {}).map(([key, value]) => `${key}=${value}`);
    for (const expression of selector?.matchExpressions || []) {
        const values = (expression.values || []).join(',');
        if (expression.operator === 'In') labels.push(`${expression.key} in (${values})`);
        else if (expression.operator === 'NotIn') labels.push(`${expression.key} notin (${values})`);
        else if (expression.operator === 'Exists') labels.push(expression.key);
        else if (expression.operator === 'DoesNotExist') labels.push('!' + expression.key);
        else throw new Error('Unsupported workload selector.');
    }
    if (!labels.length) throw new Error('This resource has no pod selector. Choose a workload or pod instead.');
    return labels.join(',');
}
export async function resolveLogPods(source: KubernetesLogSource, config = defaultLogKubeConfig(), signal = AbortSignal.timeout(8000)): Promise<k8s.V1Pod[]> {
    if (!KubernetesService.getInstance().available) throw new Error('Kubernetes is unavailable.');
    const core = config.makeApiClient(k8s.CoreV1Api);
    const options = logRequestOptions(signal);
    if (source.kind === 'cronjob') return cronJobPods(config, source, options);
    if (source.kind === 'pod') return [await core.readNamespacedPod({ namespace: source.namespace, name: source.resource }, options)];
    const labelSelector = await sourcePodSelector(source, config, options);
    const result = await core.listNamespacedPod({ namespace: source.namespace, labelSelector }, options);
    return result.items.filter(pod => !pod.metadata?.deletionTimestamp && (source.kind === 'job' || (pod.status?.phase !== 'Succeeded' && pod.status?.phase !== 'Failed')));
}
async function sourcePodSelector(source: KubernetesLogSource, config: k8s.KubeConfig, options: k8s.ConfigurationOptions) {
    let labelSelector: string | undefined;
    const core = config.makeApiClient(k8s.CoreV1Api);
    if (source.kind === 'service') {
        const service = await core.readNamespacedService({ namespace: source.namespace, name: source.resource }, options);
        labelSelector = selectorText({ matchLabels: service.spec?.selector });
    } else if (source.kind === 'job') {
        const job = await config.makeApiClient(k8s.BatchV1Api).readNamespacedJob({ namespace: source.namespace, name: source.resource }, options);
        labelSelector = selectorText(job.spec?.selector);
    } else if (source.kind === 'replicationcontroller') {
        const controller = await core.readNamespacedReplicationController({ namespace: source.namespace, name: source.resource }, options);
        labelSelector = selectorText({ matchLabels: controller.spec?.selector });
    } else if (source.kind !== 'namespace') {
        const apps = config.makeApiClient(k8s.AppsV1Api);
        const args = { namespace: source.namespace, name: source.resource };
        const workload = source.kind === 'deployment' ? await apps.readNamespacedDeployment(args, options) : await readOtherWorkload(apps, source.kind, args, options);
        labelSelector = selectorText(workload.spec?.selector);
    }
    return labelSelector;
}
async function readOtherWorkload(apps: k8s.AppsV1Api, kind: string, args: { namespace: string; name: string }, options: k8s.ConfigurationOptions) {
    const readers = {
        statefulset: () => apps.readNamespacedStatefulSet(args, options),
        daemonset: () => apps.readNamespacedDaemonSet(args, options),
        replicaset: () => apps.readNamespacedReplicaSet(args, options),
    };
    if (!(kind in readers)) throw new Error('Unsupported workload type.');
    return readers[kind as keyof typeof readers]();
}

async function cronJobPods(config: k8s.KubeConfig, source: KubernetesLogSource, options: k8s.ConfigurationOptions) {
    const batch = config.makeApiClient(k8s.BatchV1Api), core = config.makeApiClient(k8s.CoreV1Api);
    const args = { namespace: source.namespace };
    const cron = await batch.readNamespacedCronJob({ ...args, name: source.resource }, options);
    if (!cron.metadata?.uid) throw new Error('Cannot identify this CronJob.');
    const jobs = await batch.listNamespacedJob(args, options);
    const owned = new Set(jobs.items.filter(job => job.metadata?.ownerReferences?.some(owner => owner.uid === cron.metadata!.uid)).map(job => job.metadata?.uid).filter(Boolean));
    const pods = await core.listNamespacedPod(args, options);
    return pods.items.filter(pod => !pod.metadata?.deletionTimestamp && pod.metadata?.ownerReferences?.some(owner => owned.has(owner.uid)));
}
