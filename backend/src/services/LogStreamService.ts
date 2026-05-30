import { Server as SocketIOServer, Socket } from 'socket.io';
import * as chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { glob } from 'glob';
import { isPathSafe } from '../utils/pathSecurity';

// ─── Shared file watcher: ONE per unique file path ─────────────────
interface SharedFileWatcher {
    watcher: chokidar.FSWatcher;
    currentSize: number;
    refCount: number;              // Number of sockets subscribed
    pendingBuffer: string;         // Batched chunks waiting to be flushed
    flushTimer: NodeJS.Timeout | null;  // 100ms flush timer
    serviceName: string;           // Track for retention
    sourceName: string;            // Track for retention
}

// ─── Shared directory watcher: ONE per glob pattern ────────────────
interface SharedDirWatcher {
    watcher: chokidar.FSWatcher;
    limit: number;
    refCount: number;
    debounceTimer: NodeJS.Timeout | null;
}

// ─── Per-socket subscription (at most one file + one dir per socket)
interface SocketSub {
    filePath: string | null;
    dirPattern: string | null;
}

export class LogStreamService extends EventEmitter {
    private static instance: LogStreamService;
    private io: SocketIOServer | null = null;

    // Shared watchers — keyed by filePath / pattern, NOT by socket
    private fileWatchers: Map<string, SharedFileWatcher> = new Map();
    private dirWatchers: Map<string, SharedDirWatcher> = new Map();

    // Track each socket's active subscription for cleanup
    private socketSubs: Map<string, SocketSub> = new Map();

    private constructor() {
        super();
    }

    public static getInstance(): LogStreamService {
        if (!LogStreamService.instance) {
            LogStreamService.instance = new LogStreamService();
        }
        return LogStreamService.instance;
    }

    public initialize(io: SocketIOServer) {
        this.io = io;
        
        this.io.on('connection', (socket: Socket) => {
            console.log(`🔌 Client connected to logs: ${socket.id}`);

            socket.on('watch:log', async (data: { path: string, pattern?: string, limit?: number, serviceName?: string }) => {
                const { path: logPath, pattern, limit, serviceName } = data;
                console.log(`👀 Client ${socket.id} requested to watch: ${logPath} (Pattern: ${pattern}, Limit: ${limit}, Service: ${serviceName})`);
                
                if (!isPathSafe(logPath) || (pattern && !isPathSafe(pattern))) {
                    console.warn(`⚠️ Path traversal or blocked directory access attempt detected from ${socket.id}: ${logPath} / ${pattern}`);
                    socket.emit('error', { message: 'Access denied: The requested path is in a restricted system directory.' });
                    return;
                }

                // Always clean up previous subscription first
                this.unsubscribeSocket(socket);

                await this.startStreaming(socket, logPath, pattern, limit, serviceName);
            });

            socket.on('stop:watch', () => {
                this.unsubscribeSocket(socket);
            });

            socket.on('disconnect', () => {
                console.log(`❌ Client disconnected from logs: ${socket.id}`);
                this.unsubscribeSocket(socket);
            });
        });
    }

    // ─── Core streaming logic ──────────────────────────────────────────
    private async startStreaming(socket: Socket, filePath: string, pattern?: string, limit?: number, serviceName?: string) {
        let targetFile = filePath;
        const isPathGlob = filePath.includes('*');
        const searchPattern = pattern || (isPathGlob ? filePath : undefined);

        // 1. Resolve target file if path is a glob
        if (isPathGlob) {
            try {
                const resolvePattern = pattern || filePath;
                const matches = await this.scanFiles(resolvePattern, limit);

                if (matches.length === 0) {
                     socket.emit('error', { message: `No files found matching pattern: ${resolvePattern}` });
                     return;
                }

                targetFile = matches[0].path;
                
                // Emit list & resolved path to THIS socket only
                socket.emit('log:file_list', { files: matches });
                socket.emit('log:resolved', { resolvedPath: targetFile });

            } catch (err: any) {
                console.error('Glob resolution error:', err);
                socket.emit('error', { message: `Failed to resolve log pattern: ${err.message}` });
                return;
            }
        }

        // 2. Set up shared directory watcher for glob patterns
        if (searchPattern && searchPattern.includes('*')) {
             if (!isPathGlob) {
                 try {
                     const matches = await this.scanFiles(searchPattern, limit);
                     socket.emit('log:file_list', { files: matches });
                 } catch (e) { /* ignore scan error here */ }
             }
             
             this.subscribeToDirWatcher(socket, searchPattern, limit);
        }

        // 3. Verify file exists
        if (!fs.existsSync(targetFile)) {
            socket.emit('error', { message: `Log file not found: ${targetFile}` });
            return;
        }

        // 4. Send initial content to THIS socket only (not broadcast)
        try {
            const stats = fs.statSync(targetFile);
            const fileSize = stats.size;
            const bufferSize = Math.min(1024 * 10, fileSize); // 10KB context
            const buffer = Buffer.alloc(bufferSize);
            const fd = fs.openSync(targetFile, 'r');
            fs.readSync(fd, buffer, 0, bufferSize, fileSize - bufferSize);
            fs.closeSync(fd);
            
            socket.emit('log:init', { content: buffer.toString('utf-8') });

        } catch (e) {
            console.error('Error reading initial log:', e);
        }

        // 5. Subscribe to shared file watcher (creates one if needed)
        this.subscribeToFileWatcher(socket, targetFile, serviceName || 'unknown-service');
    }

    // ─── Shared file watcher: join room, create watcher if first ───────
    private subscribeToFileWatcher(socket: Socket, filePath: string, serviceName: string) {
        const roomName = `file::${filePath}`;

        // Join the socket.io room for this file
        socket.join(roomName);

        // Track this socket's subscription
        let sub = this.socketSubs.get(socket.id);
        if (!sub) {
            sub = { filePath: null, dirPattern: null };
            this.socketSubs.set(socket.id, sub);
        }
        sub.filePath = filePath;

        // If a shared watcher already exists, just bump refCount — no new watcher needed
        const existing = this.fileWatchers.get(filePath);
        if (existing) {
            existing.refCount++;
            console.log(`♻️  Reusing file watcher for ${filePath} (refs: ${existing.refCount}, socket: ${socket.id})`);
            return;
        }

        // Create a new shared watcher (first subscriber for this file)
        console.log(`📂 Creating shared file watcher: ${filePath}`);
        let currentSize = fs.statSync(filePath).size;

        const watcher = chokidar.watch(filePath, {
            persistent: true,
            usePolling: true,      // Required for Docker/WSL/NFS mounts
            interval: 1000,
        });

        const sourceName = path.basename(filePath);
        const shared: SharedFileWatcher = { 
            watcher, 
            currentSize, 
            refCount: 1, 
            pendingBuffer: '', 
            flushTimer: null,
            serviceName,
            sourceName
        };
        this.fileWatchers.set(filePath, shared);

        watcher.on('change', (changedPath) => {
            fs.stat(changedPath, (err, stats) => {
                if (err) return;

                if (stats.size > shared.currentSize) {
                    const stream = fs.createReadStream(changedPath, {
                        start: shared.currentSize,
                        end: stats.size - 1 
                    });
                    
                    stream.on('data', (chunk) => {
                        const chunkStr = chunk.toString();
                        // Buffer chunks instead of emitting immediately (backpressure)
                        shared.pendingBuffer += chunkStr;

                        // Forward to Log Retention Service asynchronously
                        import('./LogRetentionService').then(({ LogRetentionService }) => {
                            LogRetentionService.getInstance().ingest(
                                shared.serviceName, 
                                shared.sourceName, 
                                chunkStr.split('\n')
                            );
                        }).catch(e => console.error('Error importing LogRetentionService:', e));

                        // Force-flush if buffer exceeds 64KB to cap memory usage
                        if (shared.pendingBuffer.length > 65536) {
                            if (shared.flushTimer) { clearTimeout(shared.flushTimer); shared.flushTimer = null; }
                            this.io?.to(roomName).emit('log:line', { content: shared.pendingBuffer });
                            shared.pendingBuffer = '';
                            return;
                        }

                        // Start 100ms flush timer if not already running
                        if (!shared.flushTimer) {
                            shared.flushTimer = setTimeout(() => {
                                if (shared.pendingBuffer.length > 0) {
                                    this.io?.to(roomName).emit('log:line', { content: shared.pendingBuffer });
                                    shared.pendingBuffer = '';
                                }
                                shared.flushTimer = null;
                            }, 100);
                        }
                    });

                    stream.on('error', (readErr) => {
                        console.error(`Error reading log stream for ${changedPath}:`, readErr);
                    });

                    shared.currentSize = stats.size;
                } else if (stats.size < shared.currentSize) {
                    shared.currentSize = stats.size;
                    this.io?.to(roomName).emit('log:truncated', { message: 'File truncated' });
                }
            });
        });

        watcher.on('error', (error) => {
            console.error(`Log watcher error for ${filePath}:`, error);
        });
    }

    // ─── Shared dir watcher: join room, create watcher if first ────────
    private subscribeToDirWatcher(socket: Socket, pattern: string, limit?: number) {
        const roomName = `dir::${pattern}`;

        socket.join(roomName);

        let sub = this.socketSubs.get(socket.id);
        if (!sub) {
            sub = { filePath: null, dirPattern: null };
            this.socketSubs.set(socket.id, sub);
        }
        sub.dirPattern = pattern;

        const existing = this.dirWatchers.get(pattern);
        if (existing) {
            existing.refCount++;
            console.log(`♻️  Reusing dir watcher for pattern: ${pattern} (refs: ${existing.refCount})`);
            return;
        }

        console.log(`📂 Creating shared dir watcher for pattern: ${pattern}`);
        const dir = path.dirname(pattern.split('*')[0]);

        const dirWatcher = chokidar.watch(dir, {
            depth: 0,
            ignoreInitial: true,
            usePolling: true,
            interval: 1000,
            awaitWriteFinish: {
                 stabilityThreshold: 500,
                 pollInterval: 100
            }
        });

        const shared: SharedDirWatcher = {
            watcher: dirWatcher,
            limit: limit ?? 5,
            refCount: 1,
            debounceTimer: null,
        };
        this.dirWatchers.set(pattern, shared);

        const updateList = async () => {
            console.log(`♻️  Directory changed, rescanning pattern: ${pattern}`);
            try {
                const matches = await this.scanFiles(pattern, shared.limit);
                // Broadcast updated file list to ALL sockets watching this pattern
                this.io?.to(roomName).emit('log:file_list', { files: matches });
            } catch(e) {
                console.error('Failed to update log list:', e);
            }
        };

        const handleDirChange = () => {
            if (shared.debounceTimer) clearTimeout(shared.debounceTimer);
            shared.debounceTimer = setTimeout(updateList, 500);
        };

        dirWatcher.on('add', handleDirChange);
        dirWatcher.on('unlink', handleDirChange);
    }

    // ─── Unsubscribe a socket from all rooms + ref-count cleanup ───────
    private unsubscribeSocket(socket: Socket) {
        const sub = this.socketSubs.get(socket.id);
        if (!sub) return;

        // Clean up file watcher subscription
        if (sub.filePath) {
            const roomName = `file::${sub.filePath}`;
            socket.leave(roomName);

            const shared = this.fileWatchers.get(sub.filePath);
            if (shared) {
                shared.refCount--;
                if (shared.refCount <= 0) {
                    console.log(`🗑️  No subscribers left, closing file watcher: ${sub.filePath}`);
                    if (shared.flushTimer) clearTimeout(shared.flushTimer);
                    shared.watcher.close();
                    this.fileWatchers.delete(sub.filePath);
                }
            }
        }

        // Clean up directory watcher subscription
        if (sub.dirPattern) {
            const roomName = `dir::${sub.dirPattern}`;
            socket.leave(roomName);

            const shared = this.dirWatchers.get(sub.dirPattern);
            if (shared) {
                shared.refCount--;
                if (shared.refCount <= 0) {
                    console.log(`🗑️  No subscribers left, closing dir watcher: ${sub.dirPattern}`);
                    if (shared.debounceTimer) clearTimeout(shared.debounceTimer);
                    shared.watcher.close();
                    this.dirWatchers.delete(sub.dirPattern);
                }
            }
        }

        this.socketSubs.delete(socket.id);
        console.log(`🛑 Unsubscribed socket ${socket.id}`);
    }

    // ─── Utility: scan files matching a glob pattern ───────────────────
    private async scanFiles(pattern: string, limit: number = 5) {
        const files = await glob(pattern, {
            stat: true,
            withFileTypes: true,
            windowsPathsNoEscape: true // Important for Windows paths
        });

        // Use async stat to avoid blocking the event loop
        const filesWithStats = await Promise.all(
            files.map(async (f) => {
                const fullPath = typeof f === 'string' ? f : f.fullpath();
                const stat = await fs.promises.stat(fullPath);
                return {
                    name: path.basename(fullPath),
                    path: fullPath,
                    mtime: stat.mtime.getTime()
                };
            })
        );

        filesWithStats.sort((a, b) => b.mtime - a.mtime);
        
        // Return top N
        return filesWithStats.slice(0, limit);
    }
}
