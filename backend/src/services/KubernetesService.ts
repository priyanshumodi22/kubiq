import * as k8s from '@kubernetes/client-node';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface KubeContainer {
    name: string;
    image: string;
    ready: boolean;
    restartCount: number;
    state: 'running' | 'waiting' | 'terminated' | 'unknown';
    stateReason?: string;
}

export interface KubeCondition {
    type: string;
    status: string;
    reason: string;
    message: string;
}

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
    labels: Record<string, string>;
    containers: KubeContainer[];
    conditions: KubeCondition[];
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
    involvedKind: string;
    count: number;
    lastTimestamp: string | null;
}

export interface KubeDeployment {
    name: string;
    namespace: string;
    replicas: number;
    readyReplicas: number;
    availableReplicas: number;
    strategy: string;
    labels: Record<string, string>;
    conditions: KubeCondition[];
}

export class KubernetesService {
    private static instance: KubernetesService;
    private kc: k8s.KubeConfig;
    private coreApi!: k8s.CoreV1Api;
    private appsApi!: k8s.AppsV1Api;
    private customApi!: k8s.CustomObjectsApi;
    private netApi!: k8s.NetworkingV1Api;
    private storageApi!: k8s.StorageV1Api;
    private objectApi!: k8s.KubernetesObjectApi;

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

    public getKubeConfig(): k8s.KubeConfig {
        return this.kc;
    }

    public async initialize(): Promise<void> {
        try {
            const kubeConfigPath = process.env.KUBECONFIG ||
                path.join(os.homedir(), '.kube', 'config');

            if (!fs.existsSync(kubeConfigPath)) {
                console.log('☸️  No kubeconfig found — K8s monitoring disabled');
                return;
            }

            this.kc.loadFromDefault();
            this.coreApi = this.kc.makeApiClient(k8s.CoreV1Api);
            this.appsApi = this.kc.makeApiClient(k8s.AppsV1Api);
            this.customApi = this.kc.makeApiClient(k8s.CustomObjectsApi);
            this.netApi = this.kc.makeApiClient(k8s.NetworkingV1Api);
            this.storageApi = this.kc.makeApiClient(k8s.StorageV1Api);
            this.objectApi = k8s.KubernetesObjectApi.makeApiClient(this.kc);
            this.currentContext = this.kc.getCurrentContext() || 'default';

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
            const containerStatuses = pod.status?.containerStatuses ?? [];
            const specContainers = pod.spec?.containers ?? [];
            const totalRestarts = containerStatuses.reduce((s, cs) => s + (cs.restartCount ?? 0), 0);
            const totalContainers = specContainers.length;
            const readyContainers = containerStatuses.filter(cs => cs.ready).length;
            
            // Determine detailed status like terminal kubectl (CrashLoopBackOff, etc.)
            let detailedStatus = pod.status?.phase ?? 'Unknown';
            
            // Check container statuses for waiting reasons (more specific than Phase)
            const waitingState = containerStatuses.find(cs => cs.state?.waiting);
            if (waitingState?.state?.waiting?.reason) {
                detailedStatus = waitingState.state.waiting.reason;
            }
            const termState = containerStatuses.find(cs => cs.state?.terminated);
            if (termState?.state?.terminated?.reason) {
                detailedStatus = termState.state.terminated.reason;
            }

            return {
                name: pod.metadata?.name ?? '—',
                namespace: pod.metadata?.namespace ?? namespace,
                status: detailedStatus,
                isTerminating: !!pod.metadata?.deletionTimestamp,
                restarts: totalRestarts,
                ready: containerStatuses.length > 0 && containerStatuses.every(cs => cs.ready),
                readyCount: readyContainers,
                totalContainers: totalContainers,
                podIP: pod.status?.podIP ?? '—',
                nodeName: pod.spec?.nodeName ?? '—',
                startTime: pod.status?.startTime?.toISOString() ?? null,
                lastTerminationReason: containerStatuses[0]?.lastState?.terminated?.reason,
                labels: pod.metadata?.labels ?? {},
                containers: specContainers.map(c => {
                    const cs = containerStatuses.find(s => s.name === c.name);
                    return {
                        name: c.name,
                        image: c.image ?? '—',
                        ready: cs?.ready ?? false,
                        restartCount: cs?.restartCount ?? 0,
                        state: cs?.state?.running ? 'running'
                            : cs?.state?.waiting ? 'waiting'
                            : cs?.state?.terminated ? 'terminated'
                            : 'unknown',
                        stateReason: cs?.state?.waiting?.reason ?? cs?.state?.terminated?.reason,
                    };
                }),
                conditions: (pod.status?.conditions ?? []).map(c => ({
                    type: c.type,
                    status: c.status,
                    reason: c.reason ?? '—',
                    message: c.message ?? '—',
                })),
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
            return [];
        }
    }

    public async getEvents(namespace: string): Promise<KubeEvent[]> {
        if (!this.available) return [];
        const res = await this.coreApi.listNamespacedEvent({ namespace });
        return (res.items ?? [])
            .filter(e => e.type === 'Warning')
            .sort((a, b) => (b.lastTimestamp?.getTime() ?? 0) - (a.lastTimestamp?.getTime() ?? 0))
            .slice(0, 50)
            .map(e => ({
                name: e.metadata?.name ?? '—',
                type: e.type ?? 'Normal',
                reason: e.reason ?? '—',
                message: e.message ?? '—',
                involvedObject: e.involvedObject?.name ?? '—',
                involvedKind: e.involvedObject?.kind ?? '—',
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
            strategy: d.spec?.strategy?.type ?? 'RollingUpdate',
            labels: d.metadata?.labels ?? {},
            conditions: (d.status?.conditions ?? []).map(c => ({
                type: c.type,
                status: c.status,
                reason: c.reason ?? '—',
                message: c.message ?? '—',
            })),
        }));
    }

    // --- New Network & Storage Resources ---

    public async getNodes(): Promise<any[]> {
        if (!this.available) return [];
        const res = await this.coreApi.listNode();
        return res.items ?? [];
    }

    public async getServices(namespace: string): Promise<any[]> {
        if (!this.available) return [];
        const res = await this.coreApi.listNamespacedService({ namespace });
        return res.items ?? [];
    }

    public async getEndpoints(namespace: string): Promise<any[]> {
        if (!this.available) return [];
        const res = await this.coreApi.listNamespacedEndpoints({ namespace });
        return res.items ?? [];
    }

    public async getIngresses(namespace: string): Promise<any[]> {
        if (!this.available) return [];
        const res = await this.netApi.listNamespacedIngress({ namespace });
        return res.items ?? [];
    }

    public async getPersistentVolumes(): Promise<any[]> {
        if (!this.available) return [];
        const res = await this.coreApi.listPersistentVolume();
        return res.items ?? [];
    }

    public async getPersistentVolumeClaims(namespace: string): Promise<any[]> {
        if (!this.available) return [];
        const res = await this.coreApi.listNamespacedPersistentVolumeClaim({ namespace });
        return res.items ?? [];
    }

    public async getStorageClasses(): Promise<any[]> {
        if (!this.available) return [];
        const res = await this.storageApi.listStorageClass();
        return res.items ?? [];
    }

    public async getConfigMaps(namespace: string): Promise<any[]> {
        if (!this.available) return [];
        const res = await this.coreApi.listNamespacedConfigMap({ namespace });
        return res.items ?? [];
    }

    public async getSecrets(namespace: string): Promise<any[]> {
        if (!this.available) return [];
        const res = await this.coreApi.listNamespacedSecret({ namespace });
        // Redact secret data for safety before sending to frontend
        return (res.items ?? []).map(secret => {
            const redactedData: any = {};
            const data = (secret as any).data;
            if (data) {
                for (const key of Object.keys(data)) {
                    redactedData[key] = '***REDACTED***';
                }
            }
            return {
                ...secret,
                data: redactedData
            };
        });
    }

    public async getResourceRaw(namespace: string, resourceType: string, name: string): Promise<any> {
        if (!this.available) return null;
        try {
            let res: any;
            switch (resourceType) {
                case 'pods': res = await this.coreApi.readNamespacedPod({ name, namespace }); break;
                case 'deployments': res = await this.appsApi.readNamespacedDeployment({ name, namespace }); break;
                case 'services': res = await this.coreApi.readNamespacedService({ name, namespace }); break;
                case 'endpoints': res = await this.coreApi.readNamespacedEndpoints({ name, namespace }); break;
                case 'ingresses': res = await this.netApi.readNamespacedIngress({ name, namespace }); break;
                case 'configmaps': res = await this.coreApi.readNamespacedConfigMap({ name, namespace }); break;
                case 'secrets': {
                    res = await this.coreApi.readNamespacedSecret({ name, namespace });
                    if (res) {
                        // Redact data
                        if (res.data) {
                            const secretData = res.data as any;
                            for (const key of Object.keys(secretData)) {
                                secretData[key] = '***REDACTED***';
                            }
                        }
                        // Scrub last-applied-configuration annotation to prevent leaks
                        if (res.metadata?.annotations?.['kubectl.kubernetes.io/last-applied-configuration']) {
                            delete res.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration'];
                        }
                    }
                    break;
                }
                case 'nodes': res = await this.coreApi.readNode({ name }); break;
                case 'persistentvolumes': res = await this.coreApi.readPersistentVolume({ name }); break;
                case 'persistentvolumeclaims': res = await this.coreApi.readNamespacedPersistentVolumeClaim({ name, namespace }); break;
                case 'storageclasses': res = await this.storageApi.readStorageClass({ name }); break;
                case 'events': res = await this.coreApi.readNamespacedEvent({ name, namespace }); break;
                default: return { error: `Unsupported resource type: ${resourceType}` };
            }
            
            if (res && res.metadata?.managedFields) {
                delete res.metadata.managedFields;
            }
            return res;
        } catch (e) {
            console.error(`Error fetching raw K8s resource ${resourceType}/${name}:`, e);
            return null;
        }
    }
    public async scaleDeployment(namespace: string, name: string, replicas: number): Promise<void> {
        if (!this.available) return;
        try {
            const objectApi = this.kc.makeApiClient(k8s.KubernetesObjectApi);
            const patch = {
                apiVersion: 'apps/v1',
                kind: 'Deployment',
                metadata: { name, namespace },
                spec: { replicas }
            };
            // Use strategic merge patch (standard for deployments)
            await objectApi.patch(patch, {
                headers: { 'Content-Type': 'application/strategic-merge-patch+json' }
            } as any);
            console.log(`☸️  [K8s] Scaled deployment ${namespace}/${name} to ${replicas} replicas`);
        } catch (e: any) {
            console.error(`Error scaling deployment:`, e.message);
            throw e;
        }
    }

    public async restartDeployment(namespace: string, name: string): Promise<void> {
        if (!this.available) return;
        try {
            const objectApi = this.kc.makeApiClient(k8s.KubernetesObjectApi);
            // For restart, we need to patch the template, not just metadata
            const fullPatch = {
                apiVersion: 'apps/v1',
                kind: 'Deployment',
                metadata: { name, namespace },
                spec: {
                    template: {
                        metadata: {
                            annotations: {
                                'kubectl.kubernetes.io/restartedAt': new Date().toISOString()
                            }
                        }
                    }
                }
            };
            await objectApi.patch(fullPatch, {
                headers: { 'Content-Type': 'application/strategic-merge-patch+json' }
            } as any);
            console.log(`☸️  [K8s] Restarted deployment ${namespace}/${name}`);
        } catch (e: any) {
            console.error(`Error restarting deployment:`, e.message);
            throw e;
        }
    }

    public async deleteResource(namespace: string, resourceType: string, name: string): Promise<void> {
        if (!this.available) return;
        try {
            switch (resourceType) {
                case 'pods': await this.coreApi.deleteNamespacedPod({ name, namespace }); break;
                case 'deployments': await this.appsApi.deleteNamespacedDeployment({ name, namespace }); break;
                case 'services': await this.coreApi.deleteNamespacedService({ name, namespace }); break;
                case 'ingresses': await this.netApi.deleteNamespacedIngress({ name, namespace }); break;
                case 'configmaps': await this.coreApi.deleteNamespacedConfigMap({ name, namespace }); break;
                case 'secrets': await this.coreApi.deleteNamespacedSecret({ name, namespace }); break;
                case 'persistentvolumeclaims': await this.coreApi.deleteNamespacedPersistentVolumeClaim({ name, namespace }); break;
                default: throw new Error(`Deletion not supported for resource type: ${resourceType}`);
            }
            console.log(`☸️  [K8s] Deleted ${resourceType} ${namespace}/${name}`);
        } catch (e: any) {
            console.error(`Error deleting resource:`, e.message);
            throw e;
        }
    }

    async applyResource(manifest: any) {
        if (!manifest.kind || !manifest.metadata?.name) {
            throw new Error('Invalid manifest: missing kind or metadata.name');
        }

        const name = manifest.metadata.name;

        try {
            // Simplified patch call: let the library handle the default strategy (strategic merge)
            // This is the most compatible way to handle native resources like Deployments
            const response = await this.objectApi.patch(manifest);
            return response.body;
        } catch (error: any) {
            console.error(`Error applying resource ${manifest.kind}/${name}:`, error.body || error);
            throw error;
        }
    }
}


