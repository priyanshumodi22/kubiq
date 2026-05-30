import { Server, Socket } from 'socket.io';
import * as k8s from '@kubernetes/client-node';
import { PassThrough } from 'stream';
import { KubernetesService } from './KubernetesService';

interface K8sSocketSub {
    roomName: string;
}

interface SharedPodStream {
    stream: PassThrough | null;
    reqHandle: any; 
    refCount: number;
    targetRooms: Set<string>; 
    pendingBuffer: string;
    flushTimer: NodeJS.Timeout | null;
    serviceName: string;
    sourceName: string;
}

export class KubeLogStreamService {
    private static instance: KubeLogStreamService;
    private io: Server | null = null;
    private kc: k8s.KubeConfig | null = null;
    private socketSubs = new Map<string, K8sSocketSub>();
    private podStreams = new Map<string, SharedPodStream>();

    private constructor() {}

    public static getInstance(): KubeLogStreamService {
        if (!KubeLogStreamService.instance) {
            KubeLogStreamService.instance = new KubeLogStreamService();
        }
        return KubeLogStreamService.instance;
    }

    public initialize(io: Server, kc?: k8s.KubeConfig) {
        this.io = io;
        if (kc) {
            this.kc = kc;
        } else {
            const k8sService = KubernetesService.getInstance();
            this.kc = k8sService.getKubeConfig();
        }

        io.on('connection', (socket: Socket) => {
            socket.on('k8s:watch:logs', async (data: {
                namespace: string;
                podName?: string;
                deploymentName?: string;
                container?: string;
                tailLines?: number;
            }) => {
                const { namespace, podName, deploymentName, container, tailLines = 100 } = data;
                const target = podName ? `pod ${podName}` : `deployment ${deploymentName}`;
                console.log(`☸️  [K8sLogs] Socket ${socket.id} → watch ${namespace}/${target}${container ? `[${container}]` : ''}`);

                this.unsubscribeSocket(socket);

                if (!this.kc) {
                    socket.emit('k8s:log:error', { message: 'Kubernetes not connected' });
                    return;
                }

                if (podName) {
                    await this.startPodLogStream(socket, namespace, podName, container, tailLines);
                } else if (deploymentName) {
                    await this.startDeploymentLogStream(socket, namespace, deploymentName, container, tailLines);
                }
            });

            socket.on('k8s:stop:logs', () => this.unsubscribeSocket(socket));
            socket.on('disconnect', () => this.unsubscribeSocket(socket));
        });

        console.log('☸️  KubeLogStreamService initialized');
    }

    private async startPodLogStream(
        socket: Socket,
        namespace: string,
        podName: string,
        container: string | undefined,
        tailLines: number
    ) {
        const roomName = `k8s::${namespace}::pod::${podName}::${container ?? '_default_'}`;
        await this.setupStream(socket, roomName, namespace, podName, container, tailLines);
    }

    private async startDeploymentLogStream(
        socket: Socket,
        namespace: string,
        deploymentName: string,
        container: string | undefined,
        tailLines: number
    ) {
        const roomName = `k8s::${namespace}::deploy::${deploymentName}::${container ?? '_default_'}`;
        
        try {
            const kc = this.kc!;
            const appsApi = kc.makeApiClient(k8s.AppsV1Api);
            const coreApi = kc.makeApiClient(k8s.CoreV1Api);

            const deploy = await appsApi.readNamespacedDeployment({ name: deploymentName, namespace });
            const selector = deploy.spec?.selector.matchLabels;
            if (!selector) throw new Error('No selector found for deployment');

            const labelSelector = Object.entries(selector).map(([k, v]) => `${k}=${v}`).join(',');
            const podList = await coreApi.listNamespacedPod({ namespace, labelSelector });
            const pods = podList.items;

            if (pods.length === 0) {
                socket.emit('k8s:log:error', { message: 'No pods found for this deployment' });
                return;
            }

            const sub: K8sSocketSub = { roomName };
            this.socketSubs.set(socket.id, sub);
            socket.join(roomName);

            socket.emit('k8s:log:init', { lines: [`[Aggregating logs from ${pods.length} pods for deployment ${deploymentName}]`] });
            
            for (const pod of pods) {
                const pName = pod.metadata?.name;
                if (!pName) continue;
                
                const specContainers = pod.spec?.containers || [];
                let targetContainer = container;
                if (!targetContainer || !specContainers.find(c => c.name === targetContainer)) {
                    targetContainer = specContainers[0]?.name;
                }

                await this.setupStream(socket, roomName, namespace, pName, targetContainer, 5, true);
            }

        } catch (err: any) {
            console.error(`☸️  [K8sLogs] Failed to resolve deployment ${deploymentName}:`, err.message);
            socket.emit('k8s:log:error', { message: `Deployment error: ${err.message}` });
        }
    }

    private async setupStream(
        socket: Socket,
        roomName: string,
        namespace: string,
        podName: string,
        container: string | undefined,
        tailLines: number,
        isAggregation: boolean = false
    ) {
        let targetContainer = container;
        try {
            const kc = this.kc!;
            const coreApi = kc.makeApiClient(k8s.CoreV1Api);
            
            if (!targetContainer) {
                const podRes = await coreApi.readNamespacedPod({ name: podName, namespace });
                targetContainer = podRes.spec?.containers[0]?.name;
            }
        } catch (err) {}

        const podRoomKey = `k8s::pod-unit::${namespace}::${podName}::${targetContainer ?? '_default_'}`;

        if (!isAggregation) {
            const sub: K8sSocketSub = { roomName };
            this.socketSubs.set(socket.id, sub);
            socket.join(roomName);
        }

        const existing = this.podStreams.get(podRoomKey);
        if (existing) {
            existing.refCount++;
            existing.targetRooms.add(roomName);
            if (!isAggregation) {
                socket.emit('k8s:log:init', { lines: ['[Joined existing live stream — showing new lines only]'] });
            }
            return;
        }

        const log = new k8s.Log(this.kc!);
        const shared: SharedPodStream = {
            stream: null,
            reqHandle: null,
            refCount: 1,
            targetRooms: new Set([roomName]),
            pendingBuffer: '',
            flushTimer: null,
            serviceName: `k8s:${namespace}:${podName.split('-')[0]}`, // Derive logical service
            sourceName: `pod:${podName}:${targetContainer ?? '_default_'}`,
        };
        this.podStreams.set(podRoomKey, shared);

        try {
            if (!isAggregation) {
                const initLogStream = new PassThrough();
                let initContent = '';
                initLogStream.on('data', (chunk: Buffer) => { initContent += chunk.toString(); });
                await new Promise<void>((resolve) => {
                    initLogStream.on('end', resolve);
                    initLogStream.on('error', resolve);
                    log.log(namespace, podName, targetContainer ?? '', initLogStream, {
                        follow: false,
                        tailLines,
                        pretty: false,
                        timestamps: true,
                    }).catch(resolve);
                });
                const initialLines = initContent.split('\n').filter(l => l.trim().length > 0);
                socket.emit('k8s:log:init', { lines: initialLines });
            }

            const liveStream = new PassThrough();
            shared.stream = liveStream;

            liveStream.on('data', (chunk: Buffer) => {
                const text = chunk.toString();
                shared.pendingBuffer += text;

                // Forward to Log Retention Service asynchronously
                import('./LogRetentionService').then(({ LogRetentionService }) => {
                    LogRetentionService.getInstance().ingest(
                        shared.serviceName, 
                        shared.sourceName, 
                        text.split('\n')
                    );
                }).catch(e => console.error('Error importing LogRetentionService:', e));

                if (!shared.flushTimer) {
                    shared.flushTimer = setTimeout(() => {
                        for (const targetRoom of shared.targetRooms) {
                            let content = shared.pendingBuffer;
                            if (targetRoom.includes('::deploy::')) {
                                content = content.split('\n')
                                    .filter(l => l.trim().length > 0)
                                    .map(l => `[${podName}] ${l}`)
                                    .join('\n') + '\n';
                            }
                            this.io?.to(targetRoom).emit('k8s:log:line', { content });
                        }
                        shared.pendingBuffer = '';
                        shared.flushTimer = null;
                    }, 100);
                }
            });

            log.log(namespace, podName, targetContainer ?? '', liveStream, {
                follow: true,
                tailLines: isAggregation ? 5 : 0,
                pretty: false,
                timestamps: true,
            }).then(req => shared.reqHandle = req)
              .catch(err => {
                  console.error(`☸️  [K8sLogs] log.log follow error for ${podName}:`, err.message);
                  this.cleanupSharedStream(podRoomKey);
              });

        } catch (err: any) {
            console.error(`☸️  [K8sLogs] Failed to setup log stream for ${podName}:`, err.message);
            this.podStreams.delete(podRoomKey);
        }
    }

    private unsubscribeSocket(socket: Socket) {
        const sub = this.socketSubs.get(socket.id);
        if (!sub) return;

        const roomName = sub.roomName;
        socket.leave(roomName);
        this.socketSubs.delete(socket.id);

        for (const [key, shared] of this.podStreams.entries()) {
            if (shared.targetRooms.has(roomName)) {
                shared.refCount--;
                shared.targetRooms.delete(roomName);
                if (shared.refCount <= 0) {
                    this.cleanupSharedStream(key);
                }
            }
        }
    }

    private cleanupSharedStream(key: string) {
        const shared = this.podStreams.get(key);
        if (!shared) return;

        console.log(`🗑️  [K8sLogs] Destroying shared stream: ${key}`);
        if (shared.flushTimer) clearTimeout(shared.flushTimer);
        
        if (shared.reqHandle) {
            if (typeof shared.reqHandle.abort === 'function') shared.reqHandle.abort();
            else if (typeof shared.reqHandle.destroy === 'function') shared.reqHandle.destroy();
        }
        
        shared.stream?.destroy();
        this.podStreams.delete(key);
    }

    public setAvailability(available: boolean, kc: k8s.KubeConfig) {
        this.kc = kc;
    }
}
