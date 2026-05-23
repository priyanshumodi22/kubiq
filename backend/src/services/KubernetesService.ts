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
    private clientCache = new Map<string, any>();

    public available: boolean = false;
    public defaultContext: string = '';

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
            this.defaultContext = this.kc.getCurrentContext() || 'default';
            this.available = true;
            console.log(`☸️  Kubernetes connected — default context: ${this.defaultContext}`);
        } catch {
            this.available = false;
            console.log('☸️  Kubernetes not configured or unreachable — K8s monitoring disabled');
        }
    }

    private getClients(contextName: string) {
        const ctx = contextName || this.defaultContext;
        if (this.clientCache.has(ctx)) return this.clientCache.get(ctx);
        
        try {
            this.kc.setCurrentContext(ctx);
        } catch (e) {
            console.warn('Context not found in kubeconfig:', ctx);
        }

        const clients = {
            coreApi: this.kc.makeApiClient(k8s.CoreV1Api),
            appsApi: this.kc.makeApiClient(k8s.AppsV1Api),
            customApi: this.kc.makeApiClient(k8s.CustomObjectsApi),
            netApi: this.kc.makeApiClient(k8s.NetworkingV1Api),
            storageApi: this.kc.makeApiClient(k8s.StorageV1Api),
            objectApi: k8s.KubernetesObjectApi.makeApiClient(this.kc),
            autoscalingApi: this.kc.makeApiClient(k8s.AutoscalingV2Api)
        };
        this.clientCache.set(ctx, clients);
        return clients;
    }

    public getContexts(): { name: string; cluster: string; user: string }[] {
        return this.kc.contexts.map((c: any) => ({
            name: c.name,
            cluster: c.cluster ?? '',
            user: c.user ?? ''
        }));
    }

    public async getNamespaces(ctx: string): Promise<string[]> {
        if (!this.available) return [];
        const { coreApi } = this.getClients(ctx);
        const res = await coreApi.listNamespace();
        return (res.items ?? [])
            .map((ns: any) => ns.metadata?.name ?? '')
            .filter(Boolean)
            .sort();
    }

    public async getPods(ctx: string, namespace: string): Promise<KubePod[]> {
        if (!this.available) return [];
        const { coreApi } = this.getClients(ctx);
        const res = await coreApi.listNamespacedPod({ namespace });
        return (res.items ?? []).map((pod: any) => {
            const containerStatuses = pod.status?.containerStatuses ?? [];
            const specContainers = pod.spec?.containers ?? [];
            const totalRestarts = containerStatuses.reduce((s: number, cs: any) => s + (cs.restartCount ?? 0), 0);
            const totalContainers = specContainers.length;
            const readyContainers = containerStatuses.filter((cs: any) => cs.ready).length;
            
            // Determine detailed status like terminal kubectl (CrashLoopBackOff, etc.)
            let detailedStatus = pod.status?.phase ?? 'Unknown';
            
            // Check container statuses for waiting reasons (more specific than Phase)
            const waitingState = containerStatuses.find((cs: any) => cs.state?.waiting);
            if (waitingState?.state?.waiting?.reason) {
                detailedStatus = waitingState.state.waiting.reason;
            }
            const termState = containerStatuses.find((cs: any) => cs.state?.terminated);
            if (termState?.state?.terminated?.reason) {
                detailedStatus = termState.state.terminated.reason;
            }

            const referencedConfigMaps: string[] = [];
            const referencedSecrets: string[] = [];

            // Parse volumes
            (pod.spec?.volumes ?? []).forEach((v: any) => {
                if (v.configMap?.name) referencedConfigMaps.push(v.configMap.name);
                if (v.secret?.secretName) referencedSecrets.push(v.secret.secretName);
            });

            // Parse container env
            specContainers.forEach((c: any) => {
                (c.env ?? []).forEach((e: any) => {
                    if (e.valueFrom?.configMapKeyRef?.name) referencedConfigMaps.push(e.valueFrom.configMapKeyRef.name);
                    if (e.valueFrom?.secretKeyRef?.name) referencedSecrets.push(e.valueFrom.secretKeyRef.name);
                });
                (c.envFrom ?? []).forEach((ef: any) => {
                    if (ef.configMapRef?.name) referencedConfigMaps.push(ef.configMapRef.name);
                    if (ef.secretRef?.name) referencedSecrets.push(ef.secretRef.name);
                });
            });

            const uniqueConfigMaps = Array.from(new Set(referencedConfigMaps));
            const uniqueSecrets = Array.from(new Set(referencedSecrets));

            return {
                name: pod.metadata?.name ?? '—',
                refConfigMaps: uniqueConfigMaps,
                refSecrets: uniqueSecrets,
                namespace: pod.metadata?.namespace ?? namespace,
                status: detailedStatus,
                isTerminating: !!pod.metadata?.deletionTimestamp,
                restarts: totalRestarts,
                ready: containerStatuses.length > 0 && containerStatuses.every((cs: any) => cs.ready),
                readyCount: readyContainers,
                totalContainers: totalContainers,
                podIP: pod.status?.podIP ?? '—',
                nodeName: pod.spec?.nodeName ?? '—',
                startTime: pod.status?.startTime?.toISOString() ?? null,
                lastTerminationReason: containerStatuses[0]?.lastState?.terminated?.reason,
                labels: pod.metadata?.labels ?? {},
                containers: specContainers.map((c: any) => {
                    const cs = containerStatuses.find((s: any) => s.name === c.name);
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
                        imageID: cs?.imageID ?? '',
                        securityContext: c.securityContext ?? {},
                    };
                }),
                conditions: (pod.status?.conditions ?? []).map((c: any) => ({
                    type: c.type,
                    status: c.status,
                    reason: c.reason ?? '—',
                    message: c.message ?? '—',
                })),
            };
        });
    }

    public async getPodMetrics(ctx: string, namespace: string): Promise<KubeMetric[]> {
        if (!this.available) return [];
        try {
            const { customApi } = this.getClients(ctx);
            const res = await customApi.listNamespacedCustomObject({
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

    public async getEvents(ctx: string, namespace: string): Promise<KubeEvent[]> {
        if (!this.available) return [];
        const { coreApi } = this.getClients(ctx);
        const res = await coreApi.listNamespacedEvent({ namespace });
        return (res.items ?? [])
            .filter((e: any) => e.type === 'Warning')
            .sort((a: any, b: any) => (b.lastTimestamp?.getTime() ?? 0) - (a.lastTimestamp?.getTime() ?? 0))
            .slice(0, 50)
            .map((e: any) => ({
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

    public async getDeployments(ctx: string, namespace: string): Promise<KubeDeployment[]> {
        if (!this.available) return [];
        const { appsApi } = this.getClients(ctx);
        const res = await appsApi.listNamespacedDeployment({ namespace });
        return (res.items ?? []).map((d: any) => ({
            name: d.metadata?.name ?? '—',
            namespace: d.metadata?.namespace ?? namespace,
            replicas: d.spec?.replicas ?? 0,
            readyReplicas: d.status?.readyReplicas ?? 0,
            availableReplicas: d.status?.availableReplicas ?? 0,
            strategy: d.spec?.strategy?.type ?? 'RollingUpdate',
            labels: d.metadata?.labels ?? {},
            conditions: (d.status?.conditions ?? []).map((c: any) => ({
                type: c.type,
                status: c.status,
                reason: c.reason ?? '—',
                message: c.message ?? '—',
            })),
        }));
    }

    public async getNodes(ctx: string): Promise<any[]> {
        if (!this.available) return [];
        const { coreApi } = this.getClients(ctx);
        const res = await coreApi.listNode();
        return res.items ?? [];
    }

    public async getServices(ctx: string, namespace: string): Promise<any[]> {
        if (!this.available) return [];
        const { coreApi } = this.getClients(ctx);
        const res = await coreApi.listNamespacedService({ namespace });
        return res.items ?? [];
    }

    public async getEndpoints(ctx: string, namespace: string): Promise<any[]> {
        if (!this.available) return [];
        const { coreApi } = this.getClients(ctx);
        const res = await coreApi.listNamespacedEndpoints({ namespace });
        return res.items ?? [];
    }

    public async getIngresses(ctx: string, namespace: string): Promise<any[]> {
        if (!this.available) return [];
        const { netApi } = this.getClients(ctx);
        const res = await netApi.listNamespacedIngress({ namespace });
        return res.items ?? [];
    }

    public async getPersistentVolumes(ctx: string): Promise<any[]> {
        if (!this.available) return [];
        const { coreApi } = this.getClients(ctx);
        const res = await coreApi.listPersistentVolume();
        return res.items ?? [];
    }

    public async getPersistentVolumeClaims(ctx: string, namespace: string): Promise<any[]> {
        if (!this.available) return [];
        const { coreApi } = this.getClients(ctx);
        const res = await coreApi.listNamespacedPersistentVolumeClaim({ namespace });
        return res.items ?? [];
    }

    public async getStorageClasses(ctx: string): Promise<any[]> {
        if (!this.available) return [];
        const { storageApi } = this.getClients(ctx);
        const res = await storageApi.listStorageClass();
        return res.items ?? [];
    }

    public async getConfigMaps(ctx: string, namespace: string): Promise<any[]> {
        if (!this.available) return [];
        const { coreApi } = this.getClients(ctx);
        const res = await coreApi.listNamespacedConfigMap({ namespace });
        return res.items ?? [];
    }

    public async getSecrets(ctx: string, namespace: string): Promise<any[]> {
        if (!this.available) return [];
        const { coreApi } = this.getClients(ctx);
        const res = await coreApi.listNamespacedSecret({ namespace });
        // Redact secret data for safety before sending to frontend
        return (res.items ?? []).map((secret: any) => {
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

    public async getResourceRaw(ctx: string, namespace: string, resourceType: string, name: string): Promise<any> {
        if (!this.available) return null;
        const { coreApi, appsApi, netApi, storageApi } = this.getClients(ctx);
        try {
            let res: any;
            switch (resourceType) {
                case 'pods': res = await coreApi.readNamespacedPod({ name, namespace }); break;
                case 'deployments': res = await appsApi.readNamespacedDeployment({ name, namespace }); break;
                case 'services': res = await coreApi.readNamespacedService({ name, namespace }); break;
                case 'endpoints': res = await coreApi.readNamespacedEndpoints({ name, namespace }); break;
                case 'ingresses': res = await netApi.readNamespacedIngress({ name, namespace }); break;
                case 'configmaps': res = await coreApi.readNamespacedConfigMap({ name, namespace }); break;
                case 'secrets': {
                    res = await coreApi.readNamespacedSecret({ name, namespace });
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
                case 'nodes': res = await coreApi.readNode({ name }); break;
                case 'persistentvolumes': res = await coreApi.readPersistentVolume({ name }); break;
                case 'persistentvolumeclaims': res = await coreApi.readNamespacedPersistentVolumeClaim({ name, namespace }); break;
                case 'storageclasses': res = await storageApi.readStorageClass({ name }); break;
                case 'events': res = await coreApi.readNamespacedEvent({ name, namespace }); break;
                case 'horizontalpodautoscalers': {
                    const { autoscalingApi } = this.getClients(ctx);
                    const response = await autoscalingApi.readNamespacedHorizontalPodAutoscaler({ name, namespace });
                    res = response.body ? response.body : response;
                    break;
                }
                case 'verticalpodautoscalers': {
                    const { customApi } = this.getClients(ctx);
                    const response = await customApi.getNamespacedCustomObject({
                        group: 'autoscaling.k8s.io',
                        version: 'v1',
                        namespace,
                        plural: 'verticalpodautoscalers',
                        name
                    });
                    res = (response as any).body ? (response as any).body : response;
                    break;
                }
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
    public async getAutoscalersForResource(ctx: string, namespace: string, resourceType: string, name: string): Promise<{ hpa: any[], vpa: any[] }> {
        if (!this.available) return { hpa: [], vpa: [] };
        const { autoscalingApi, customApi } = this.getClients(ctx);
        const result: { hpa: any[], vpa: any[] } = { hpa: [], vpa: [] };

        // Normalize resource kind
        let kind = 'Deployment';
        if (resourceType === 'pods') kind = 'Pod';
        if (resourceType === 'statefulsets') kind = 'StatefulSet';
        if (resourceType === 'daemonsets') kind = 'DaemonSet';
        if (resourceType === 'replicasets') kind = 'ReplicaSet';

        try {
            const hpaRes = await autoscalingApi.listNamespacedHorizontalPodAutoscaler({ namespace });
            const allHpas = hpaRes.items || [];
            result.hpa = allHpas.filter((hpa: any) => 
                hpa.spec?.scaleTargetRef?.name === name && 
                hpa.spec?.scaleTargetRef?.kind === kind
            );
        } catch (e) {
            console.error(`Error fetching HPAs in ${namespace}:`, e);
        }

        try {
            const vpaRes = await customApi.listNamespacedCustomObject({
                group: 'autoscaling.k8s.io',
                version: 'v1',
                namespace,
                plural: 'verticalpodautoscalers'
            }) as any;
            
            const allVpas = vpaRes?.items || [];
            result.vpa = allVpas.filter((vpa: any) => 
                vpa.spec?.targetRef?.name === name && 
                vpa.spec?.targetRef?.kind === kind
            );
        } catch (e) {
            // VPA might not be installed, ignore errors
        }

        return result;
    }

    public async scaleDeployment(ctx: string, namespace: string, name: string, replicas: number): Promise<void> {
        if (!this.available) return;
        const { objectApi } = this.getClients(ctx);
        try {
            const patch = {
                apiVersion: 'apps/v1',
                kind: 'Deployment',
                metadata: { name, namespace },
                spec: { replicas }
            };
            await objectApi.patch(patch);
            console.log(`☸️  [K8s] Scaled deployment ${namespace}/${name} to ${replicas} replicas`);
        } catch (e: any) {
            console.error(`Error scaling deployment:`, e.message);
            throw e;
        }
    }

    public async restartDeployment(ctx: string, namespace: string, name: string): Promise<void> {
        if (!this.available) return;
        const { objectApi } = this.getClients(ctx);
        try {
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
            await objectApi.patch(fullPatch);
            console.log(`☸️  [K8s] Restarted deployment ${namespace}/${name}`);
        } catch (e: any) {
            console.error(`Error restarting deployment:`, e.message);
            throw e;
        }
    }

    public async deleteResource(ctx: string, namespace: string, resourceType: string, name: string): Promise<void> {
        if (!this.available) return;
        const { coreApi, appsApi, netApi } = this.getClients(ctx);
        try {
            switch (resourceType) {
                case 'pods': await coreApi.deleteNamespacedPod({ name, namespace }); break;
                case 'deployments': await appsApi.deleteNamespacedDeployment({ name, namespace }); break;
                case 'services': await coreApi.deleteNamespacedService({ name, namespace }); break;
                case 'ingresses': await netApi.deleteNamespacedIngress({ name, namespace }); break;
                case 'configmaps': await coreApi.deleteNamespacedConfigMap({ name, namespace }); break;
                case 'secrets': await coreApi.deleteNamespacedSecret({ name, namespace }); break;
                case 'persistentvolumeclaims': await coreApi.deleteNamespacedPersistentVolumeClaim({ name, namespace }); break;
                case 'horizontalpodautoscalers': {
                    const { autoscalingApi } = this.getClients(ctx);
                    await autoscalingApi.deleteNamespacedHorizontalPodAutoscaler({ name, namespace });
                    break;
                }
                case 'verticalpodautoscalers': {
                    const { customApi } = this.getClients(ctx);
                    await customApi.deleteNamespacedCustomObject({
                        group: 'autoscaling.k8s.io',
                        version: 'v1',
                        namespace,
                        plural: 'verticalpodautoscalers',
                        name
                    });
                    break;
                }
                default: throw new Error(`Deletion not supported for resource type: ${resourceType}`);
            }
            console.log(`☸️  [K8s] Deleted ${resourceType} ${namespace}/${name}`);
        } catch (e: any) {
            console.error(`Error deleting resource:`, e.message);
            throw e;
        }
    }

    async applyResource(ctx: string, manifest: any) {
        const { objectApi } = this.getClients(ctx);
        if (!manifest.kind || !manifest.metadata?.name) {
            throw new Error('Invalid manifest: missing kind or metadata.name');
        }

        const name = manifest.metadata.name;

        // Strip read-only fields to prevent 409 Conflict errors on patch
        if (manifest.metadata) {
            delete manifest.metadata.resourceVersion;
            delete manifest.metadata.uid;
            delete manifest.metadata.creationTimestamp;
            delete manifest.metadata.generation;
        }
        if (manifest.status) {
            delete manifest.status;
        }

        try {
            const response = await objectApi.patch(manifest);
            return response.body;
        } catch (error: any) {
            const errBody = typeof error.body === 'string' ? error.body : JSON.stringify(error.body || {});
            const errMessage = error.message || '';
            const is404 = 
                error.statusCode === 404 || 
                error.response?.statusCode === 404 || 
                errBody.includes('"code":404') || 
                errBody.includes('"reason":"NotFound"') ||
                errMessage.includes('404');

            if (is404) {
                try {
                    const createResponse = await objectApi.create(manifest);
                    return createResponse.body;
                } catch (createError: any) {
                    console.error(`Error creating resource ${manifest.kind}/${name}:`, createError.body || createError);
                    throw createError;
                }
            }
            
            console.error(`Error applying resource ${manifest.kind}/${name}:`, error.body || error);
            throw error;
        }
    }
}
