import { Server, Socket } from 'socket.io';
import * as k8s from '@kubernetes/client-node';
import { PassThrough } from 'stream';
import { KubernetesService } from './KubernetesService';

interface TerminalSession {
    connection: any;
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    podName: string;
}

export class KubeTerminalStreamService {
    private static instance: KubeTerminalStreamService;
    private io: Server | null = null;
    private kc: k8s.KubeConfig | null = null;
    private sessions = new Map<string, TerminalSession>();

    private constructor() {}

    public static getInstance(): KubeTerminalStreamService {
        if (!KubeTerminalStreamService.instance) {
            KubeTerminalStreamService.instance = new KubeTerminalStreamService();
        }
        return KubeTerminalStreamService.instance;
    }

    public initialize(io: Server, kc?: k8s.KubeConfig) {
        this.io = io;
        this.kc = kc || KubernetesService.getInstance().getKubeConfig();

        io.on('connection', (socket: Socket) => {
            socket.on('k8s:start:terminal', async (data: {
                namespace: string;
                podName: string;
                container?: string;
                cols?: number;
                rows?: number;
            }) => {
                const { namespace, podName, container } = data;
                console.log(`☸️  [K8sTerminal] Socket ${socket.id} → start terminal in ${namespace}/${podName}`);

                this.cleanupSession(socket.id);

                if (!this.kc) {
                    socket.emit('k8s:terminal:error', { message: 'Kubernetes not connected' });
                    return;
                }

                try {
                    const coreApi = this.kc.makeApiClient(k8s.CoreV1Api);
                    
                    let containerName = container;
                    if (!containerName) {
                        const podRes = await coreApi.readNamespacedPod({ name: podName, namespace });
                        containerName = podRes.spec?.containers[0]?.name;
                    }

                    if (!containerName) {
                        socket.emit('k8s:terminal:error', { message: 'No containers found in pod' });
                        return;
                    }

                    const stdin = new PassThrough();
                    const stdout = new PassThrough();
                    const stderr = new PassThrough();

                    stdout.on('data', (chunk: Buffer) => {
                        socket.emit('k8s:terminal:output', chunk.toString('utf8'));
                    });

                    stderr.on('data', (chunk: Buffer) => {
                        socket.emit('k8s:terminal:output', chunk.toString('utf8'));
                    });

                    const cols = data.cols || 80;
                    const rows = data.rows || 24;

                    const exec = new k8s.Exec(this.kc);
                    const shellCmd = [
                        '/bin/sh', 
                        '-c', 
                        `export COLUMNS=${cols}; export LINES=${rows}; export TERM=xterm-256color; [ -x /bin/bash ] && exec /bin/bash || exec /bin/sh`
                    ];
                    
                    const connection = await exec.exec(
                        namespace,
                        podName,
                        containerName,
                        shellCmd,
                        stdout,
                        stderr,
                        stdin,
                        true, // tty
                        (status) => {
                            console.log(`☸️  [K8sTerminal] Exec exited for ${podName}:`, status);
                            socket.emit('k8s:terminal:exit', status);
                            this.cleanupSession(socket.id);
                        }
                    );

                    // Sync initial TTY dimensions immediately on launch before shell prompt is drawn
                    if (data.cols && data.rows && typeof connection.resize === 'function') {
                        try {
                            connection.resize(data.cols, data.rows);
                        } catch (e) {}
                    }

                    this.sessions.set(socket.id, {
                        connection,
                        stdin,
                        stdout,
                        stderr,
                        podName
                    });

                    socket.emit('k8s:terminal:ready');

                } catch (err: any) {
                    console.error(`☸️  [K8sTerminal] Failed to launch terminal for ${podName}:`, err.message);
                    socket.emit('k8s:terminal:error', { message: `Terminal connection failed: ${err.message}` });
                }
            });

            socket.on('k8s:terminal:input', (data: { text: string }) => {
                const session = this.sessions.get(socket.id);
                if (session && session.stdin) {
                    session.stdin.write(data.text);
                }
            });

            socket.on('k8s:terminal:resize', (data: { cols: number, rows: number }) => {
                const session = this.sessions.get(socket.id);
                if (session && session.connection && typeof session.connection.resize === 'function') {
                    try {
                        session.connection.resize(data.cols, data.rows);
                    } catch (e) {}
                }
            });

            socket.on('k8s:stop:terminal', () => {
                this.cleanupSession(socket.id);
            });

            socket.on('disconnect', () => {
                this.cleanupSession(socket.id);
            });
        });

        console.log('☸️  KubeTerminalStreamService initialized');
    }

    private cleanupSession(socketId: string) {
        const session = this.sessions.get(socketId);
        if (!session) return;

        console.log(`🗑️  [K8sTerminal] Destroying terminal session for socket: ${socketId}`);

        try {
            if (session.connection) {
                if (typeof session.connection.close === 'function') {
                    session.connection.close();
                } else if (typeof session.connection.terminate === 'function') {
                    session.connection.terminate();
                }
            }
        } catch (e) {}

        session.stdin.destroy();
        session.stdout.destroy();
        session.stderr.destroy();

        this.sessions.delete(socketId);
    }
}
