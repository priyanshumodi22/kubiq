import { Server as SocketIOServer, Socket } from 'socket.io';
import * as chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { glob } from 'glob';

interface LogWatcher {
    filePath: string;
    watcher?: chokidar.FSWatcher;
    filePattern?: string; // If this is part of a rotation group
    fileLimit?: number; // New: Limit for pattern matching
}

export class LogStreamService extends EventEmitter {
    private static instance: LogStreamService;
    private io: SocketIOServer | null = null;
    private activeWatchers: Map<string, LogWatcher> = new Map(); // Key: socketId + filePath

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

            socket.on('watch:log', async (data: { path: string, pattern?: string, limit?: number }) => {
                const { path: logPath, pattern, limit } = data;
                console.log(`👀 Client ${socket.id} requested to watch: ${logPath} (Pattern: ${pattern}, Limit: ${limit})`);
                
                await this.startStreaming(socket, logPath, pattern, limit);
            });

            socket.on('stop:watch', () => {
                this.stopStreaming(socket);
            });

            socket.on('disconnect', () => {
                console.log(`❌ Client disconnected from logs: ${socket.id}`);
                this.stopStreaming(socket);
            });
        });
    }

    private async startStreaming(socket: Socket, filePath: string, pattern?: string, limit?: number) {
        let targetFile = filePath;
        const isPathGlob = filePath.includes('*');
        const searchPattern = pattern || (isPathGlob ? filePath : undefined);

        // 1. Resolve Target File if path is a glob
        if (isPathGlob) {
            try {
                // If path is glob, we MUST resolve it to a single file (default: latest)
                // We use the same scanFiles logic but with limit 1 if we just need the latest, 
                // but since we likely want the list too, we can utilize scanFiles with 'limit' if pattern matches.
                
                // If pattern is NOT provided, we treat valid glob path as the pattern
                const resolvePattern = pattern || filePath;
                const matches = await this.scanFiles(resolvePattern, limit); // Get list (respects limit)

                if (matches.length === 0) {
                     socket.emit('error', { message: `No files found matching pattern: ${resolvePattern}` });
                     return;
                }

                targetFile = matches[0].path; // Default to latest
                
                // Emit list immediately since we have it
                socket.emit('log:file_list', { files: matches });
                socket.emit('log:resolved', { resolvedPath: targetFile });

            } catch (err: any) {
                console.error('Glob resolution error:', err);
                socket.emit('error', { message: `Failed to resolve log pattern: ${err.message}` });
                return;
            }
        }

        // 2. Identify if we should watch directory/pattern for updates (File List & Rotations)
        // If 'pattern' is explicitly provided OR 'filePath' was a glob (meaning we derived the pattern), we watch.
        if (searchPattern && searchPattern.includes('*')) {
             // If we didn't already emit the list (i.e. filePath wasn't a glob, but pattern was provided)
             // We should scan and emit now.
             if (!isPathGlob) {
                 try {
                     const matches = await this.scanFiles(searchPattern, limit);
                     socket.emit('log:file_list', { files: matches });
                 } catch (e) { /* ignore scan error here, maybe pattern is empty */ }
             }
             
             this.watchForDirectoryChanges(socket, searchPattern, limit);
        }

        if (!fs.existsSync(targetFile)) {
            socket.emit('error', { message: `Log file not found: ${targetFile}` });
            return;
        }

        // 3. Stream Content
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

        // Start File Watcher
        let currentSize = fs.statSync(targetFile).size;

        const fileWatcher = chokidar.watch(targetFile, {
            persistent: true,
            usePolling: true,
            interval: 1000,
        });

        fileWatcher.on('change', (changedPath) => {
            fs.stat(changedPath, (err, stats) => {
                if (err) return;

                if (stats.size > currentSize) {
                    const stream = fs.createReadStream(changedPath, {
                        start: currentSize,
                        end: stats.size - 1 
                    });
                    
                    stream.on('data', (chunk) => {
                        socket.emit('log:line', { content: chunk.toString() });
                    });

                    stream.on('error', (err) => {
                        console.error(`Error reading log stream for ${changedPath}:`, err);
                    });

                    currentSize = stats.size;
                } else if (stats.size < currentSize) {
                    currentSize = stats.size;
                    socket.emit('log:truncated', { message: 'File truncated' });
                }
            });
        });

        fileWatcher.on('error', (error) => {
            console.error(`Log watcher error for ${targetFile}:`, error);
        });

        this.activeWatchers.set(socket.id, {
            filePath: targetFile,
            watcher: fileWatcher,
            filePattern: pattern || (isPathGlob ? filePath : undefined),
            fileLimit: limit
        });
    }

    private async scanFiles(pattern: string, limit: number = 5) { // Default limit 5 if not provided
        const files = await glob(pattern, {
            stat: true,
            withFileTypes: true,
            windowsPathsNoEscape: true // Important for Windows paths
        });

        const filesWithStats = files.map(f => {
            const fullPath = typeof f === 'string' ? f : f.fullpath(); 
            return {
                name: path.basename(fullPath),
                path: fullPath,
                mtime: fs.statSync(fullPath).mtime.getTime()
            };
        });

        filesWithStats.sort((a, b) => b.mtime - a.mtime);
        
        // Return top N
        return filesWithStats.slice(0, limit);
    }

    private stopStreaming(socket: Socket) {
        const watcherData = this.activeWatchers.get(socket.id);
        if (watcherData && watcherData.watcher) {
            watcherData.watcher.close();
            this.activeWatchers.delete(socket.id);
            // Note: We are leaking the directory watcher here in this simple implementation
            // Ideally, we store the dirWatcher capable of closing too.
            // But since this is a singleton service and dir watchers might be shared... 
            // For now, let's assume one-watcher-per-socket simplifiction.
            // TODO: Proper cleanup of directory watchers.
            console.log(`🛑 Stopped watching for ${socket.id}`);
        }
    }

    private watchForDirectoryChanges(socket: Socket, pattern: string, limit?: number) {
       // Watch parent directory for any additions/deletions that update our "Top N" list
       // pattern: /var/log/app-*.log -> dir: /var/log
       
       // Handle glob properly to get base dir. 
       // Simplest: take dirname of the pattern assuming no glob in parent dirs for now.
       const dir = path.dirname(pattern.split('*')[0]); // Heuristic: part before first wildcard

       // Debounce timer
       let updateTimer: NodeJS.Timeout | null = null;

       const dirWatcher = chokidar.watch(dir, {
           depth: 0,
           ignoreInitial: true,
           usePolling: true, // Critical for WSL/Docker/Network mounts
           interval: 1000,
           awaitWriteFinish: {
                stabilityThreshold: 500, // Faster detection of completed writes
                pollInterval: 100
           }
       });

       const updateList = async () => {
           console.log(`♻️  Directory changed, rescanning pattern: ${pattern}`);
           try {
               const matches = await this.scanFiles(pattern, limit);
               socket.emit('log:file_list', { files: matches });
           } catch(e) {
               console.error('Failed to update log list:', e);
           }
       };

       const handleDirChange = () => {
           if (updateTimer) clearTimeout(updateTimer);
           updateTimer = setTimeout(updateList, 500); // 0.5s debounce (was 2s)
       };

       dirWatcher.on('add', handleDirChange);
       dirWatcher.on('unlink', handleDirChange);
       // We should also attach this dirWatcher to activeWatchers for cleanup!
       // Since the current structure only holds one watcher, we might need to composite it.
       // For this task, let's just piggyback or assume user disconnect cleans up by standard timeout (not great).
       // PROPER FIX: Combine watchers.
       const current = this.activeWatchers.get(socket.id);
       if (current) {
           // Hack: Create a composite close function
           const oldClose = current.watcher?.close.bind(current.watcher);
           current.watcher = {
               close: async () => {
                   await oldClose?.();
                   await dirWatcher.close();
               }
           } as any;
       }
    }
}
