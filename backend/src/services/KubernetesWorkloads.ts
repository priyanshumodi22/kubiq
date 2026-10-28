import * as k8s from '@kubernetes/client-node';

export const workloadTypes = new Set(['statefulsets', 'daemonsets', 'replicasets', 'jobs', 'cronjobs', 'replicationcontrollers']);
export function workloadConfig(base: k8s.KubeConfig, context: string): k8s.KubeConfig {
    const config = new k8s.KubeConfig();
    config.loadFromOptions({ clusters: [...base.clusters], users: [...base.users], contexts: [...base.contexts], currentContext: context || base.getCurrentContext() });
    return config;
}
export function workloadReaders(config: k8s.KubeConfig, namespace: string, name = '') {
    const apps = config.makeApiClient(k8s.AppsV1Api), batch = config.makeApiClient(k8s.BatchV1Api), core = config.makeApiClient(k8s.CoreV1Api);
    const args = { namespace, name };
    return {
        statefulsets: { list: () => apps.listNamespacedStatefulSet(args), read: () => apps.readNamespacedStatefulSet(args) },
        daemonsets: { list: () => apps.listNamespacedDaemonSet(args), read: () => apps.readNamespacedDaemonSet(args) },
        replicasets: { list: () => apps.listNamespacedReplicaSet(args), read: () => apps.readNamespacedReplicaSet(args) },
        jobs: { list: () => batch.listNamespacedJob(args), read: () => batch.readNamespacedJob(args) },
        cronjobs: { list: () => batch.listNamespacedCronJob(args), read: () => batch.readNamespacedCronJob(args) },
        replicationcontrollers: { list: () => core.listNamespacedReplicationController(args), read: () => core.readNamespacedReplicationController(args) },
    };
}
type WorkloadShape = {
    kind?: string; metadata?: k8s.V1ObjectMeta;
    spec?: { replicas?: number; completions?: number; schedule?: string; suspend?: boolean; template?: { spec?: { containers?: k8s.V1Container[] } }; jobTemplate?: { spec?: { template?: { spec?: { containers?: k8s.V1Container[] } } } } };
    status?: { readyReplicas?: number; numberReady?: number; desiredNumberScheduled?: number; succeeded?: number; failed?: number; active?: number | unknown[]; conditions?: Array<{ type: string; status: string }>; lastScheduleTime?: Date };
};
export function workloadSummary(type: string, input: unknown) {
    const item = input as WorkloadShape, spec = item.spec || {}, status = item.status || {};
    const containers = spec.template?.spec?.containers || spec.jobTemplate?.spec?.template?.spec?.containers || [];
    return { name: item.metadata?.name, namespace: item.metadata?.namespace, metadata: item.metadata,
        kind: item.kind, workloadType: type, replicas: spec.replicas ?? 0, readyReplicas: status.readyReplicas ?? status.numberReady ?? 0,
        desired: status.desiredNumberScheduled ?? spec.replicas ?? 0, schedule: spec.schedule, suspended: spec.suspend ?? false,
        completions: spec.completions ?? 1, succeeded: status.succeeded ?? 0, failed: status.failed ?? 0,
        active: Array.isArray(status.active) ? status.active.length : status.active ?? 0,
        completed: (status.conditions || []).some(condition => condition.type === 'Complete' && condition.status === 'True'),
        failedCondition: (status.conditions || []).some(condition => condition.type === 'Failed' && condition.status === 'True'),
        lastScheduleTime: status.lastScheduleTime, containers: containers.map(container => ({ name: container.name, image: container.image })),
    };
}
export async function listWorkloads(config: k8s.KubeConfig, namespace: string, type: string) {
    const readers = workloadReaders(config, namespace);
    if (!workloadTypes.has(type)) throw new Error('Unsupported workload type');
    const result = await readers[type as keyof typeof readers].list();
    return result.items.map(item => workloadSummary(type, item));
}
export async function readWorkload(config: k8s.KubeConfig, namespace: string, type: string, name: string) {
    const readers = workloadReaders(config, namespace, name);
    if (!workloadTypes.has(type)) throw new Error('Unsupported workload type');
    return readers[type as keyof typeof readers].read();
}
