import React, { useEffect, useState, useRef } from 'react';
import { Virtuoso } from 'react-virtuoso';
import io from 'socket.io-client';
import { X, Play, Pause, Trash2, ArrowDown, FileText } from 'lucide-react';

interface LogViewerProps {
    logPath: string; // The file path or pattern to watch
    isOpen: boolean;
    onClose: () => void;
    serviceName: string; // For context
    isEmbedded?: boolean; // New: If true, renders without modal overlay
}

// Log line structure: timestamp usually implicit in content, but we wrap it
interface LogLine {
    id: number;
    content: string;
}

export const LogViewer: React.FC<LogViewerProps> = ({ logPath, isOpen, onClose, serviceName, isEmbedded = false }) => {
    const [logs, setLogs] = useState<LogLine[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [atBottom, setAtBottom] = useState(true);
    const [newLogsCount, setNewLogsCount] = useState(0);
    const [activeFile, setActiveFile] = useState<string>(logPath);
    const [rotationAlert, setRotationAlert] = useState<{ newFile: string; message: string } | null>(null);

    const socketRef = useRef<any>(null); // Use any or explicit ReturnType<typeof io> if imported
    const virtuosoRef = useRef<any>(null);
    const logsRef = useRef<LogLine[]>([]); // Ref to keep track without re-rendering everything constantly

    // Connect to Socket.IO
    useEffect(() => {
        if (!isOpen) return;

        // Path should include context path if configured, usually handle by io() generic
        const backendUrl = import.meta.env.VITE_BACKEND_DNS || window.location.origin;
        const contextPath = import.meta.env.VITE_BACKEND_CONTEXT_PATH || '';
        
        const socket = io(backendUrl, {
            path: `${contextPath}/socket.io`,
            transports: ['websocket']
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            setIsConnected(true);
            console.log('🔌 Connected to Log Stream');
            
            // Start watching
            socket.emit('watch:log', { path: activeFile, pattern: logPath.includes('*') ? logPath : undefined });
        });

        socket.on('disconnect', () => {
            setIsConnected(false);
            console.log('❌ Disconnected to Log Stream');
        });

        socket.on('log:init', (data: { content: string }) => {
            const lines = data.content.split('\n').filter(Boolean).map((line, i) => ({ id: Date.now() + i, content: line }));
            setLogs(lines);
            logsRef.current = lines; // Sync ref
        });

        socket.on('log:line', (data: { content: string }) => {
            const newLine = { id: Date.now(), content: data.content };
            
            // If paused, just accumulate in Ref potentially or State, but track count
            // We update state regardless to render, but Virtuoso handles the scrolling
            setLogs(prev => [...prev, newLine]);
            
            if (isPaused || !atBottom) {
                 setNewLogsCount(prev => prev + 1);
            }
        });

        socket.on('rotation:available', (data: { newFile: string, message: string }) => {
            console.log('Rotation:', data);
            setRotationAlert(data);
        });

        socket.on('error', (err: any) => {
            console.error('Socket Error:', err);
             setLogs(prev => [...prev, { id: Date.now(), content: `[SYSTEM ERROR]: ${err.message}` }]);
        });

        return () => {
            socket.disconnect();
        };
    }, [isOpen, logPath, activeFile]); // Re-connect if activeFile changes (rotation)

    // Handle Rotation Switch
    const switchToNewFile = () => {
        if (!rotationAlert || !socketRef.current) return;
        
        setActiveFile(rotationAlert.newFile);
        setLogs([]); // Clear logs for new file
        setRotationAlert(null);
        // Effect will trigger re-connection with new activeFile
    };

    // Auto-scroll logic handled mostly by Virtuoso 'followOutput'
    
    if (!isOpen) return null;

    const content = (
         <div className={`bg-[#0f1115] border border-gray-800 rounded-xl w-full h-full flex flex-col overflow-hidden ${isEmbedded ? '' : 'max-w-5xl h-[85vh] shadow-2xl'}`}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-[#161920]">
                    <div className="flex items-center space-x-3">
                        <FileText className="w-5 h-5 text-gray-400" />
                        <div>
                             <h2 className="text-sm font-bold text-gray-200">{serviceName} Logs</h2>
                             <p className="text-xs text-gray-500 font-mono">{activeFile}</p>
                        </div>
                        {isConnected ? (
                            <span className="flex items-center text-[10px] text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse"></span>
                                LIVE
                            </span>
                        ) : (
                             <span className="flex items-center text-[10px] text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                                offline
                            </span>
                        )}
                    </div>
                    
                    <div className="flex items-center space-x-2">
                        <button 
                            onClick={() => setLogs([])}
                            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors"
                            title="Clear Buffer"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                        {!isEmbedded && (
                            <button 
                                onClick={onClose}
                                className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Rotation Alert Banner */}
                {rotationAlert && (
                     <div className="bg-blue-600/10 border-b border-blue-500/20 px-4 py-2 flex items-center justify-between">
                         <div className="flex items-center text-blue-400 text-sm">
                             <span className="mr-2">🔄</span>
                             {rotationAlert.message}
                         </div>
                         <button 
                            onClick={switchToNewFile}
                            className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded transition-colors font-medium"
                        >
                            Switch to New File
                        </button>
                     </div>
                )}

                {/* Log Terminal Area */}
                <div className="flex-1 relative bg-[#0d0d0d] font-mono text-xs">
                    {/* Floating Actions inside Terminal */}
                    <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                        {/* Auto-scroll / Pause Status */}
                        <button 
                            onClick={() => {
                                setIsPaused(!isPaused);
                                if (isPaused) {
                                    setAtBottom(true);
                                    setNewLogsCount(0);
                                    virtuosoRef.current?.scrollToIndex({ index: logs.length - 1, align: 'end' });
                                }
                            }}
                            className={`flex items-center space-x-2 px-3 py-1.5 rounded-full backdrop-blur-md border shadow-lg transition-all ${
                                isPaused 
                                ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20' 
                                : 'bg-gray-800/80 border-gray-700 text-gray-300 hover:bg-gray-700'
                            }`}
                        >
                            {isPaused ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                            <span>{isPaused ? 'Paused' : 'Tailing'}</span>
                        </button>
                    </div>

                    {/* New Logs Badge (Sticky Bottom) */}
                    {newLogsCount > 0 && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
                            <button
                                onClick={() => {
                                    setIsPaused(false);
                                    setAtBottom(true);
                                    setNewLogsCount(0);
                                    virtuosoRef.current?.scrollToIndex({ index: logs.length - 1, align: 'end', behavior: 'smooth' });
                                }}
                                className="flex items-center space-x-2 bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg transition-all animate-bounce"
                            >
                                <ArrowDown className="w-4 h-4" />
                                <span>{newLogsCount} New Lines</span>
                            </button>
                        </div>
                    )}

                    <Virtuoso
                        ref={virtuosoRef}
                        data={logs}
                        followOutput={isPaused ? false : 'auto'}
                        atBottomStateChange={(bottom) => {
                            setAtBottom(bottom);
                            if (bottom) setNewLogsCount(0); // Clear badge if user manually scrolls to bottom
                        }}
                        itemContent={(index, log) => (
                            <div className="px-4 py-0.5 hover:bg-white/5 break-all whitespace-pre-wrap text-gray-300 border-l-2 border-transparent hover:border-gray-600">
                                <span className="select-text opacity-50 mr-3 text-[10px] w-8 inline-block text-right">{index + 1}</span>
                                <span className="select-text">{log.content}</span>
                            </div>
                        )}
                        className="h-full scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent"
                    />
                </div>
        </div>
    );

    if (isEmbedded) {
        return content;
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
             {content}
        </div>
    );
};
