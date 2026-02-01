import React, { useEffect, useState, useRef } from 'react';
import { Virtuoso } from 'react-virtuoso';
import io from 'socket.io-client';
import { X, Play, Pause, Trash2, ArrowDown, FileText, ChevronDown, Check } from 'lucide-react';
import { LogSource } from '../types';

interface LogViewerProps {
    logPath: string; // Legacy fallback
    logSources?: LogSource[]; // New multiple sources
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

export const LogViewer: React.FC<LogViewerProps> = ({ logPath, logSources, isOpen, onClose, serviceName, isEmbedded = false }) => {
    // Determine effective sources
    const effectiveSources = (logSources && logSources.length > 0) 
        ? logSources 
        : [{ id: 'default', name: 'Default Log', path: logPath }];

    const [selectedSourceId, setSelectedSourceId] = useState<string>(effectiveSources[0].id);
    const selectedSource = effectiveSources.find(s => s.id === selectedSourceId) || effectiveSources[0];

    const [logs, setLogs] = useState<LogLine[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [atBottom, setAtBottom] = useState(true);
    const [newLogsCount, setNewLogsCount] = useState(0);
    
    const [availableFiles, setAvailableFiles] = useState<any[]>([]);
    
    // activeFile tracks the ACTUAL file being streamed (which might differ from pattern if rotation occurred)
    const [activeFile, setActiveFile] = useState<string>(selectedSource.path);
    const [rotationAlert, setRotationAlert] = useState<{ newFile: string; message: string } | null>(null);

    // Dropdown state for source selector
    const [isSourceDropdownOpen, setIsSourceDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const socketRef = useRef<any>(null); // Use any or explicit ReturnType<typeof io> if imported
    const virtuosoRef = useRef<any>(null);
    const logsRef = useRef<LogLine[]>([]); // Ref to keep track without re-rendering everything constantly

    // Handle outside click for dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsSourceDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Reset state when Service/Source changes
    useEffect(() => {
        if (isOpen) {
             setLogs([]);
             setNewLogsCount(0);
             setRotationAlert(null);
             setAvailableFiles([]); // Reset files list
             // When source ID changes, reset active file to that source's configured path
             const source = effectiveSources.find(s => s.id === selectedSourceId) || effectiveSources[0];
             setActiveFile(source.path);
        }
    }, [isOpen, selectedSourceId, serviceName]); // Re-init on service switch too

    // Safe-guard: if selectedSourceId is no longer valid (e.g. data reloaded), reset to first
    useEffect(() => {
        if (effectiveSources.length > 0 && !effectiveSources.find(s => s.id === selectedSourceId)) {
            setSelectedSourceId(effectiveSources[0].id);
        }
    }, [effectiveSources, selectedSourceId]);

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
            // console.log('🔌 Connected to Log Stream');
            
            // Start watching
            const sourcePath = selectedSource.path;
            const usePattern = sourcePath.includes('*') ? sourcePath : undefined;
            const limit = selectedSource.fileLimit;
            
            socket.emit('watch:log', { path: activeFile, pattern: usePattern, limit });
        });

        socket.on('disconnect', () => {
            setIsConnected(false);
            // console.log('❌ Disconnected to Log Stream');
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

        socket.on('log:resolved', (data: { resolvedPath: string }) => {
             // Backend resolved the pattern to this specific file.
             // We update activeFile so UI shows the real filename
             setActiveFile(data.resolvedPath);
        });
        
        socket.on('log:file_list', (data: { files: any[] }) => {
            setAvailableFiles(data.files);
        });

        socket.on('rotation:available', (data: { newFile: string, message: string }) => {
            // console.log('Rotation:', data);
            setRotationAlert(data);
        });

        socket.on('error', (err: any) => {
            console.error('Socket Error:', err);
             setLogs(prev => [...prev, { id: Date.now(), content: `[SYSTEM ERROR]: ${err.message}` }]);
        });

        return () => {
            socket.disconnect();
        };
    }, [isOpen, selectedSourceId, activeFile]); // Re-connect if activeFile changes (rotation)

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
                        <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                             <div className="flex items-center gap-2">
                                <h2 className="text-sm font-bold text-gray-200 whitespace-nowrap">{serviceName} Logs</h2>
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
                             
                             <div className="flex items-center mt-1">
                                 {/* Source Selector */}
                                 {effectiveSources.length > 1 && (
                                     <div className="relative mr-3" ref={dropdownRef}>
                                         <button 
                                            onClick={() => setIsSourceDropdownOpen(!isSourceDropdownOpen)}
                                            className="flex items-center space-x-1 text-xs text-blue-400 hover:text-blue-300 transition-colors font-mono bg-blue-500/10 px-2 py-0.5 rounded cursor-pointer border border-blue-500/20"
                                         >
                                             <span className="truncate max-w-[150px]">{selectedSource.name}</span>
                                             <ChevronDown className="w-3 h-3" />
                                         </button>
 
                                         {/* Dropdown */}
                                         {isSourceDropdownOpen && (
                                             <div className="absolute top-full left-0 mt-2 w-64 bg-[#1d1f24] border border-white/10 rounded-lg shadow-xl z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                                 {effectiveSources.map(source => (
                                                     <button
                                                         key={source.id}
                                                         onClick={() => {
                                                             setSelectedSourceId(source.id);
                                                             setIsSourceDropdownOpen(false);
                                                         }}
                                                         className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 flex items-center justify-between group"
                                                     >
                                                         <div className="min-w-0">
                                                             <div className={`font-medium ${selectedSourceId === source.id ? 'text-blue-400' : 'text-gray-300'}`}>
                                                                 {source.name}
                                                             </div>
                                                             <div className="text-[10px] text-gray-500 font-mono truncate">
                                                                 {source.path}
                                                             </div>
                                                         </div>
                                                         {selectedSourceId === source.id && <Check className="w-3 h-3 text-blue-500" />}
                                                     </button>
                                                 ))}
                                             </div>
                                         )}
                                     </div>
                                 )}

                                {/* Patterned File Tabs */}
                                 {availableFiles.length > 0 ? (
                                    <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar mask-gradient-right">
                                        {availableFiles.map((file, idx) => {
                                            const isActive = activeFile === file.path;
                                            return (
                                                <button
                                                    key={file.path}
                                                    onClick={() => {
                                                        setActiveFile(file.path);
                                                        setLogs([]); // Clear logs when switching file
                                                    }}
                                                    className={`
                                                        px-2 py-0.5 text-[10px] rounded-full border transition-all whitespace-nowrap font-mono
                                                        ${isActive 
                                                            ? 'bg-blue-500/20 border-blue-500/50 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.2)]' 
                                                            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                                                        }
                                                    `}
                                                    title={file.path}
                                                >
                                                    {idx === 0 && <span className="mr-1 text-green-400">●</span>}
                                                    {file.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                 ) : (
                                     <span className="text-[10px] text-gray-500 font-mono truncate max-w-[300px]" title={activeFile}>
                                         {activeFile.split(/[/\\]/).pop()}
                                     </span>
                                 )}
                             </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
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
