import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Virtuoso } from 'react-virtuoso';
import io from 'socket.io-client';
import { Play, Pause, Trash2, ArrowDown, FileText, ChevronDown, Check, Activity, Search, Sparkles, Lock, CheckCircle2, Zap, Copy, X, RefreshCw } from 'lucide-react';
import { LogSource } from '../types';
import { LogSearch } from './LogSearch';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { apiClient } from '../services/api';

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
    level: 'error' | 'warn' | 'info' | 'debug' | 'plain';
}

function classifyLine(content: string): LogLine['level'] {
    // Look for explicit level tags or prefix assignments (e.g. [WARN], level=warn, "level":"error")
    const explicitMatch =
        content.match(/\[(ERROR|WARN|WARNING|INFO|DEBUG|TRACE|FATAL|PANIC|CRITICAL)\]/i) ||
        content.match(/\b(level|severity|lvl)\s*[:=]\s*["']?(error|warn|warning|info|debug|trace|fatal|panic|critical)\b/i) ||
        content.match(/^(?:[\d-T:.Z\s+]+)?\b(ERROR|WARN|WARNING|INFO|DEBUG|TRACE|FATAL|PANIC|CRITICAL)\b/i);

    if (explicitMatch) {
        const found = (explicitMatch[1] || explicitMatch[2]).toLowerCase();
        if (['error', 'fatal', 'panic', 'critical'].includes(found)) return 'error';
        if (['warn', 'warning'].includes(found)) return 'warn';
        if (['info', 'information'].includes(found)) return 'info';
        if (['debug', 'trace'].includes(found)) return 'debug';
    }

    // Default to plain if no explicit level was found (industry standard)
    return 'plain';
}

const LEVEL_COLORS: Record<LogLine['level'], string> = {
    error: 'text-red-400',
    warn: 'text-yellow-400',
    info: 'text-blue-400',
    debug: 'text-gray-500',
    plain: 'text-gray-300',
};

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
    const [activeTab, setActiveTab] = useState<'live' | 'search'>('live');

    // AI Summary State
    const [summary, setSummary] = useState<string | null>(null);
    const [summarizing, setSummarizing] = useState(false);
    const [showSummaryModal, setShowSummaryModal] = useState(false);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [recentSummaryData, setRecentSummaryData] = useState<{ summary: string, timestamp: number } | null>(null);

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

    // Fetch recent AI summary
    useEffect(() => {
        if (!isOpen || !serviceName) return;
        apiClient.getRecentSummary(serviceName)
            .then(res => {
                if (res.available) {
                    setRecentSummaryData(res.summary);
                } else {
                    setRecentSummaryData(null);
                }
            })
            .catch(err => console.error('Failed to fetch recent summary', err));
    }, [isOpen, serviceName]);

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

            socket.emit('watch:log', { path: activeFile, pattern: usePattern, limit, serviceName });
        });

        socket.on('disconnect', () => {
            setIsConnected(false);
            // console.log('❌ Disconnected to Log Stream');
        });

        socket.on('log:init', (data: { content: string }) => {
            const lines = data.content.split('\n').filter(Boolean).map((line, i) => ({
                id: Date.now() + i,
                content: line,
                level: classifyLine(line)
            }));
            setLogs(lines);
            logsRef.current = lines; // Sync ref
        });

        socket.on('log:line', (data: { content: string }) => {
            const newLines = data.content.split('\n').filter(Boolean).map((line, i) => ({
                id: Date.now() + i + Math.random(),
                content: line,
                level: classifyLine(line)
            }));

            // If paused, just accumulate in Ref potentially or State, but track count
            // We update state regardless to render, but Virtuoso handles the scrolling
            setLogs(prev => [...prev, ...newLines]);

            if (isPaused || !atBottom) {
                setNewLogsCount(prev => prev + newLines.length);
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
            setLogs(prev => [...prev, { id: Date.now(), content: `[SYSTEM ERROR]: ${err.message}`, level: 'error' }]);
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

    // Handle AI Summarization
    const handleSummarize = async () => {
        if (logs.length === 0) return;
        setSummarizing(true);
        try {
            // Send only the last 200 logs to prevent massive payloads and 413 errors
            const payload = logs.slice(-200).map(l => ({ message: l.content, level: l.level.toUpperCase() }));
            const data = await apiClient.summarizeLogs(payload, serviceName);

            setShowSummaryModal(true);
            if (data.summary) {
                setSummary(data.summary);
            } else {
                setSummary('Failed to generate summary.');
            }
        } catch (err: any) {
            console.error('Summarize error:', err);

            if (err.response?.status === 402 || err.response?.data?.error === 'NO_LICENSE' || err.response?.data?.error === 'INVALID_LICENSE') {
                setShowUpgradeModal(true);
                return;
            }

            setShowSummaryModal(true);
            setSummary('Error communicating with summarization service.');
        } finally {
            setSummarizing(false);
        }
    };

    // Auto-scroll logic handled mostly by Virtuoso 'followOutput'

    if (!isOpen) return null;

    const modals = (
        <>
            {/* AI Summary Modal — portal to body to escape backdrop-blur stacking context */}
            {createPortal(
                <AnimatePresence>
                    {showSummaryModal && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-8"
                            onClick={() => setShowSummaryModal(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                className="bg-[#161920] border border-gray-700/50 rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh] overflow-hidden"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-gradient-to-r from-purple-900/20 to-blue-900/20">
                                    <h3 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
                                        <Sparkles className="w-5 h-5 text-purple-400" />
                                        AI Log Analysis
                                    </h3>
                                    <div className="flex items-center gap-2">
                                        {summary && !summarizing && (
                                            <button 
                                                onClick={() => {
                                                    navigator.clipboard.writeText(summary);
                                                }} 
                                                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10 border border-gray-700/50"
                                                title="Copy to clipboard"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                                Copy
                                            </button>
                                        )}
                                        <button onClick={() => setShowSummaryModal(false)} className="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10">
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                                <div className="p-6 overflow-y-auto custom-scrollbar font-sans text-gray-300 text-sm leading-relaxed prose prose-invert max-w-none">
                                    {summarizing ? (
                                        <div className="flex flex-col items-center justify-center py-12">
                                            <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                                            <p className="text-purple-400 animate-pulse">Analyzing logs with AI...</p>
                                        </div>
                                    ) : summary ? (
                                        <ReactMarkdown>{summary}</ReactMarkdown>
                                    ) : (
                                        <p className="text-red-400">Failed to generate summary.</p>
                                    )}
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* Upgrade Modal — portal to body */}
            {createPortal(
                <AnimatePresence>
                    {showUpgradeModal && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4"
                            onClick={() => setShowUpgradeModal(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.9, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                exit={{ scale: 0.9, y: 20 }}
                                className="bg-[#0a0a0a] border border-gray-800/80 rounded-2xl shadow-[0_0_50px_rgba(147,51,234,0.15)] w-full max-w-lg overflow-hidden relative"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="absolute -top-32 -left-32 w-64 h-64 bg-purple-600/20 rounded-full blur-3xl"></div>
                                <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-blue-600/20 rounded-full blur-3xl"></div>
                                <div className="relative z-10 p-8 flex flex-col items-center text-center">
                                    <button onClick={() => setShowUpgradeModal(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white bg-gray-800/50 hover:bg-gray-700/50 p-1.5 rounded-full transition-colors">
                                        <X className="w-5 h-5" />
                                    </button>
                                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg mb-6 transform rotate-3">
                                        <Lock className="w-8 h-8 text-white" />
                                    </div>
                                    <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-2 font-sans">Unlock kubiq Pro</h2>
                                    <p className="text-gray-400 text-sm mb-8 max-w-sm">Get instant AI-driven root cause analysis for your logs. Troubleshoot issues 10x faster.</p>
                                    <div className="w-full space-y-4 mb-8 text-left bg-gray-900/50 p-5 rounded-xl border border-gray-800/50">
                                        <div className="flex items-center gap-3 text-sm text-gray-300"><CheckCircle2 className="w-5 h-5 text-purple-400 shrink-0" /><span>Instant AI Root Cause Analysis</span></div>
                                        <div className="flex items-center gap-3 text-sm text-gray-300"><CheckCircle2 className="w-5 h-5 text-blue-400 shrink-0" /><span>Anomaly &amp; Pattern Detection</span></div>
                                        <div className="flex items-center gap-3 text-sm text-gray-300"><Zap className="w-5 h-5 text-yellow-400 shrink-0" /><span><strong>BYOK:</strong> Support for OpenAI, Anthropic, &amp; Gemini</span></div>
                                    </div>
                                    <a href="https://polar.sh/kubiq" target="_blank" rel="noreferrer" className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-medium py-3 px-6 rounded-xl transition-all shadow-[0_0_20px_rgba(147,51,234,0.3)] hover:shadow-[0_0_30px_rgba(147,51,234,0.5)] transform hover:-translate-y-0.5 flex items-center justify-center gap-2">
                                        Get Pro License (One-Time Fee)
                                    </a>
                                    <p className="text-xs text-gray-400 mt-5 font-medium bg-gray-800/30 px-3 py-1.5 rounded-md border border-gray-700/50 inline-block">
                                        Already have a license? Add it to your .env file as <code className="text-purple-400">KUBIQ_LICENSE_KEY</code>
                                    </p>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>
    );

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

                            {activeTab === 'live' && (
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
                            )}
                        </div>
                    </div>

                    <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
                        {/* Tab Switcher */}
                        <div className="flex bg-black/40 rounded-lg p-1 mr-2 border border-gray-800">
                            <button
                                onClick={() => setActiveTab('live')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === 'live' ? 'bg-[#2a2d36] text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                                    }`}
                            >
                                <Activity className="w-3.5 h-3.5" /> Live Stream
                            </button>
                            <button
                                onClick={() => setActiveTab('search')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === 'search' ? 'bg-[#2a2d36] text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                                    }`}
                            >
                                <Search className="w-3.5 h-3.5" /> Historical Search
                            </button>
                        </div>

                        {activeTab === 'live' && (
                            <button
                                onClick={() => setLogs([])}
                                className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors"
                                title="Clear Buffer"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
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

                {activeTab === 'search' ? (
                    <LogSearch serviceName={serviceName} />
                ) : (
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
                                className={`flex items-center space-x-2 px-3 py-1.5 rounded-full backdrop-blur-md border shadow-lg transition-all ${isPaused
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
                                <div className={`px-4 py-0.5 hover:bg-white/5 border-l-2 border-transparent hover:border-gray-600 flex gap-3 ${LEVEL_COLORS[log.level] || LEVEL_COLORS.plain}`}>
                                    <span className="select-none opacity-30 w-8 text-right shrink-0 text-[10px] pt-px">{index + 1}</span>
                                    <span className="break-all whitespace-pre-wrap flex-1 select-text leading-relaxed">{log.content}</span>
                                </div>
                            )}
                            className="h-full scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent"
                        />

                        {/* AI Floating Button (Live Stream) */}
                        {logs.length > 0 && (
                            <div className="absolute bottom-6 right-6 z-30">
                                <button
                                    onClick={handleSummarize}
                                    disabled={summarizing}
                                    className="group flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white px-5 py-2.5 rounded-full shadow-[0_0_20px_rgba(147,51,234,0.3)] transition-all transform hover:scale-105"
                                >
                                    {summarizing ? (
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Sparkles className="w-4 h-4 group-hover:animate-pulse text-yellow-300" />
                                    )}
                                    <span className="font-sans font-medium text-sm">Summarize with AI</span>
                                </button>
                                
                                {recentSummaryData && !summarizing && (
                                    <div className="absolute bottom-full right-0 mb-3 w-64">
                                        <button 
                                            onClick={() => {
                                                setSummary(recentSummaryData.summary);
                                                setShowSummaryModal(true);
                                            }}
                                            className="w-full bg-[#161920]/90 backdrop-blur border border-purple-500/30 hover:border-purple-500/60 rounded-xl p-3 shadow-lg hover:shadow-[0_0_15px_rgba(147,51,234,0.2)] transition-all text-left group/banner"
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <Sparkles className="w-3.5 h-3.5 text-purple-400 group-hover/banner:animate-pulse" />
                                                <span className="text-xs font-semibold text-purple-300">AI Insight Available</span>
                                            </div>
                                            <div className="text-[10px] text-gray-400">
                                                Analyzed {Math.floor((Date.now() - recentSummaryData.timestamp) / 60000)} mins ago
                                            </div>
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
    );

    if (isEmbedded) {
        return <>{content}{modals}</>;
    }

    return (
        <>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                {content}
            </div>
            {modals}
        </>
    );
};
