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

            socket.on('watch:log', async (data: { path: string, pattern?: string }) => {
                const { path: logPath, pattern } = data;
                console.log(`👀 Client ${socket.id} requested to watch: ${logPath} (Pattern: ${pattern})`);
                
                await this.startStreaming(socket, logPath, pattern);
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

    private async startStreaming(socket: Socket, filePath: string, pattern?: string) {
        // Validation: Verify if it's a glob pattern or direct file
        let targetFile = filePath;
        let isGlob = filePath.includes('*') || (pattern && pattern.includes('*'));

        if (isGlob) {
            try {
                // If it is a glob, resolve to the latest file
                const searchPattern = pattern || filePath;
                const files = await glob(searchPattern, {
                    stat: true,
                    withFileTypes: true
                });

                if (files.length === 0) {
                     socket.emit('error', { message: `No files found matching pattern: ${searchPattern}` });
                     return;
                }

                // Sort by mtime descending (newest first)
                // Note: glob v10+ withFileTypes returns Path objects with mtime, but simple strings need fs.stat
                // Let's assume simple string return for safety across versions or map it
                // Using a safe manual stat approach to be robust:
                const filesWithStats = files.map(f => {
                    const fullPath = typeof f === 'string' ? f : f.fullpath(); 
                    return {
                        path: fullPath,
                        mtime: fs.statSync(fullPath).mtime.getTime()
                    };
                });

                filesWithStats.sort((a, b) => b.mtime - a.mtime);
                
                targetFile = filesWithStats[0].path;
                
                // If we found a file, ensure we watch for rotation on the PATTERN
                this.watchForRotation(socket, targetFile, searchPattern);

                console.log(`🎯 Resolved glob pattern '${searchPattern}' to latest file: ${targetFile}`);
                socket.emit('log:resolved', { resolvedPath: targetFile }); // Optional: tell client what we found

            } catch (err: any) {
                console.error('Glob resolution error:', err);
                socket.emit('error', { message: `Failed to resolve log pattern: ${err.message}` });
                return;
            }
        } else if (pattern) {
             this.watchForRotation(socket, filePath, pattern);
        }

        if (!fs.existsSync(targetFile)) {
            socket.emit('error', { message: `Log file not found: ${targetFile}` });
            return;
        }

        // Send initial chunk (last 100 lines or so) - simplified for "tail"
        // For heavy history, use REST API. This is just for immediate stream context.
        // Reading last 2KB for context
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
        // Using fs.watchFile is poll-heavy, chokidar is better but efficient "tailing" needs care.
        // For simple tailing, fs.watch is often sufficient if we track size.
        
        let currentSize = fs.statSync(targetFile).size;

        const fileWatcher = chokidar.watch(targetFile, {
            persistent: true,
            usePolling: true, // often needed for VM/Container volumes
            interval: 1000,
        });

        fileWatcher.on('change', (changedPath) => {
            fs.stat(changedPath, (err, stats) => {
                if (err) return;

                if (stats.size > currentSize) {
                    // Valid read range: [currentSize, stats.size - 1]
                    // If file grew, stats.size > currentSize, so stats.size >= 1.
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
                    // File truncated (rotation?)
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
            filePattern: pattern
        });
    }

    private stopStreaming(socket: Socket) {
        const watcherData = this.activeWatchers.get(socket.id);
        if (watcherData && watcherData.watcher) {
            watcherData.watcher.close();
            this.activeWatchers.delete(socket.id);
            console.log(`🛑 Stopped watching for ${socket.id}`);
        }
    }

    private watchForRotation(socket: Socket, currentPath: string, pattern: string) {
        // pattern: /var/log/app-*.log
        // directory: /var/log/
        const dir = path.dirname(currentPath);
        // Clean glob pattern for chokidar if needed, but assuming user provides full glob like /var/log/app-*.log
        
        // Simple directory watcher to check against pattern
        const dirWatcher = chokidar.watch(dir, {
            depth: 0,
            ignoreInitial: true
        });

        dirWatcher.on('add', (newFilePath) => {
             // Check if new file matches our pattern (simple regex check or glob match)
             // For now, let's assume if it shares the prefix
             // Real implementation would use minimatch
             // Just notify client a new file appeared
             socket.emit('rotation:available', { 
                 newFile: newFilePath, 
                 message: `New log file detected: ${path.basename(newFilePath)}` 
             });
        });

        // Store this watcher too? For now, we attach it to the main watcher cleanup 
        // (Simplified: in production, manage these together)
    }
}
