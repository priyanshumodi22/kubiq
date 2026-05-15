import * as k8s from '@kubernetes/client-node';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface KubePod {
    name: string;
    namespace: string;
    status: string;
    restarts: number;
    ready: boolean;
    podIP: string;
    nodeName: string;
    startTime: string | null;
    lastTerminationReason?: string;
}

export interface KubeMetric {
    name: string;
    namespace: string;
    containers: { name: string; cpu: string; memory: string }[];
}

export interface KubeEvent {
    name: string;
    type: string;
    reason: string;
    message: string;
    involvedObject: string;
    count: number;
    lastTimestamp: string | null;
}

export interface KubeDeployment {
    name: string;
    namespace: string;
    replicas: number;
    readyReplicas: number;
    availableReplicas: number;
}

export class KubernetesService {
    private static instance: KubernetesService;
    private kc: k8s.KubeConfig;
    private coreApi!: k8s.CoreV1Api;
    private appsApi!: k8s.AppsV1Api;
    private customApi!: k8s.CustomObjectsApi;

    public available: boolean = false;
    public currentContext: string = '';

    private constructor() {
        this.kc = new k8s.KubeConfig();
    }

    public static getInstance(): KubernetesService {
        if (!KubernetesService.instance) {
            KubernetesService.instance = new KubernetesService();
        }
        return KubernetesService.instance;
    }

    public async initialize(): Promise<void> {
        try {
            // ── Step 1: Pre-check kubeconfig file existence ──────────────────
            // This avoids any network calls (and hanging) when there is simply
            // no kubeconfig on this machine. KUBECONFIG env var is checked first,
            // then the default ~/.kube/config path.
            const kubeConfigPath = process.env.KUBECONFIG ||
                path.join(os.homedir(), '.kube', 'config');

            if (!fs.existsSync(kubeConfigPath)) {
                console.log('☸️  No kubeconfig found — K8s monitoring disabled');
                return; // fast exit, no network attempt
            }

            // ── Step 2: Load config & build API clients ───────────────────────
            this.kc.loadFromDefault();
            this.coreApi = this.kc.makeApiClient(k8s.CoreV1Api);
            this.appsApi = this.kc.makeApiClient(k8s.AppsV1Api);
            this.customApi = this.kc.makeApiClient(k8s.CustomObjectsApi);
            this.currentContext = this.kc.getCurrentContext() || 'default';

            // ── Step 3: Connectivity test with hard 5-second timeout ──────────
            // Prevents hanging when kubeconfig exists but the cluster is unreachable.
            const timeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('K8s connection timeout (5s)')), 5000)
            );
            await Promise.race([this.coreApi.listNamespace({ limit: 1 }), timeout]);

            this.available = true;
            console.log(`☸️  Kubernetes connected — context: ${this.currentContext}`);
        } catch {
            this.available = false;
            console.log('☸️  Kubernetes not configured or unreachable — K8s monitoring disabled');
        }
    }

    public async getNamespaces(): Promise<string[]> {
        if (!this.available) return [];
        const res = await this.coreApi.listNamespace();
        return (res.items ?? [])
            .map(ns => ns.metadata?.name ?? '')
            .filter(Boolean)
            .sort();
    }

    public async getPods(namespace: string): Promise<KubePod[]> {
        if (!this.available) return [];
        const res = await this.coreApi.listNamespacedPod({ namespace });
        return (res.items ?? []).map(pod => {
            const cs = pod.status?.containerStatuses?.[0];
            return {
                name: pod.metadata?.name ?? '—',
                namespace: pod.metadata?.namespace ?? namespace,
                status: pod.status?.phase ?? 'Unknown',
                restarts: cs?.restartCount ?? 0,
                ready: cs?.ready ?? false,
                podIP: pod.status?.podIP ?? '—',
                nodeName: pod.spec?.nodeName ?? '—',
                startTime: pod.status?.startTime?.toISOString() ?? null,
                lastTerminationReason: cs?.lastState?.terminated?.reason,
            };
        });
    }

    public async getPodMetrics(namespace: string): Promise<KubeMetric[]> {
        if (!this.available) return [];
        try {
            const res = await this.customApi.listNamespacedCustomObject({
                group: 'metrics.k8s.io',
                version: 'v1beta1',
                namespace,
                plural: 'pods',
            }) as any;
            const items = res?.items ?? [];
            return items.map((m: any) => ({
                name: m.metadata?.name ?? '—',
                namespace: m.metadata?.namespace ?? namespace,
                containers: (m.containers ?? []).map((c: any) => ({
                    name: c.name ?? '—',
                    cpu: c.usage?.cpu ?? '0m',
                    memory: c.usage?.memory ?? '0Mi',
                })),
            }));
        } catch {
            // Metrics Server may not be installed — return empty gracefully
            return [];
        }
    }

    public async getEvents(namespace: string): Promise<KubeEvent[]> {
        if (!this.available) return [];
        const res = await this.coreApi.listNamespacedEvent({ namespace });
        return (res.items ?? [])
            .filter(e => e.type === 'Warning')
            .sort((a, b) => {
                const ta = a.lastTimestamp?.getTime() ?? 0;
                const tb = b.lastTimestamp?.getTime() ?? 0;
                return tb - ta;
            })
            .slice(0, 50)
            .map(e => ({
                name: e.metadata?.name ?? '—',
                type: e.type ?? 'Normal',
                reason: e.reason ?? '—',
                message: e.message ?? '—',
                involvedObject: e.involvedObject?.name ?? '—',
                count: e.count ?? 1,
                lastTimestamp: e.lastTimestamp?.toISOString() ?? null,
            }));
    }

    public async getDeployments(namespace: string): Promise<KubeDeployment[]> {
        if (!this.available) return [];
        const res = await this.appsApi.listNamespacedDeployment({ namespace });
        return (res.items ?? []).map(d => ({
            name: d.metadata?.name ?? '—',
            namespace: d.metadata?.namespace ?? namespace,
            replicas: d.spec?.replicas ?? 0,
            readyReplicas: d.status?.readyReplicas ?? 0,
            availableReplicas: d.status?.availableReplicas ?? 0,
        }));
    }
}
