import { useEffect, useRef, useState, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import io from 'socket.io-client';
import { Play, Pause, Trash2, ArrowDown, ChevronDown, Check, Search, X, Activity, Copy } from 'lucide-react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { LogSearch } from './LogSearch';
import { apiClient } from '../services/api';
import { ProUpgradeModal } from './ProUpgradeModal';
import { AiStatusOrb } from './AiStatusOrb';

interface K8sLogViewerProps {
    namespace: string;
    podName?: string;
    deploymentName?: string;
    containers: Array<{ name: string; image: string }>;
}

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
    error:  'text-red-400',
    warn:   'text-yellow-400',
    info:   'text-blue-400',
    debug:  'text-gray-500',
    plain:  'text-gray-300',
};

const TAIL_OPTIONS = [50, 100, 200, 500];

export function K8sLogViewer({ namespace, podName, deploymentName, containers }: K8sLogViewerProps) {
    const [selectedContainer, setSelectedContainer] = useState(containers[0]?.name ?? '');
    const [tailLines, setTailLines] = useState(100);
    const [containerDropdownOpen, setContainerDropdownOpen] = useState(false);
    const [tailDropdownOpen, setTailDropdownOpen] = useState(false);

    const [logs, setLogs] = useState<LogLine[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [newLogsCount, setNewLogsCount] = useState(0);
    const [streamEnded, setStreamEnded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'live' | 'search'>('live');

    const socketRef = useRef<any>(null);
    const virtuosoRef = useRef<any>(null);
    const isPausedRef = useRef(isPaused);
    isPausedRef.current = isPaused;

    // AI Summary
    const [summary, setSummary] = useState<string | null>(null);
    const [summarizing, setSummarizing] = useState(false);
    const [showSummaryModal, setShowSummaryModal] = useState(false);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [recentSummaryData, setRecentSummaryData] = useState<{ summary: string, timestamp: number } | null>(null);

    // Filter logs based on search query (literal or regex)
    const filteredLogs = useMemo(() => {
        if (!searchQuery) return logs;
        try {
            const regex = new RegExp(searchQuery, 'i');
            return logs.filter((log) => regex.test(log.content));
        } catch {
            const lowerQuery = searchQuery.toLowerCase();
            return logs.filter((log) => log.content.toLowerCase().includes(lowerQuery));
        }
    }, [logs, searchQuery]);

    // Connect to Socket.IO and start streaming
    useEffect(() => {
        setLogs([]);
        setNewLogsCount(0);
        setStreamEnded(false);
        setError(null);

        const backendUrl = (import.meta as any).env?.VITE_BACKEND_DNS || window.location.origin;
        const contextPath = (import.meta as any).env?.VITE_BACKEND_CONTEXT_PATH || '';

        const socket = io(backendUrl, {
            path: `${contextPath}/socket.io`,
            transports: ['websocket'],
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            setIsConnected(true);
            socket.emit('k8s:watch:logs', {
                namespace,
                podName,
                deploymentName,
                container: selectedContainer,
                tailLines,
            });
        });

        socket.on('disconnect', () => setIsConnected(false));

        socket.on('k8s:log:init', (data: { lines: string[] }) => {
            const mapped: LogLine[] = data.lines.map((content, i) => ({
                id: Date.now() + i,
                content,
                level: classifyLine(content),
            }));
            setLogs(mapped);
        });

        socket.on('k8s:log:line', (data: { content: string }) => {
            const newLines: LogLine[] = data.content
                .split('\n')
                .filter(Boolean)
                .map((content) => ({ id: Date.now() + Math.random(), content, level: classifyLine(content) }));

            setLogs(prev => [...prev, ...newLines]);

            if (isPausedRef.current) {
                setNewLogsCount(prev => prev + newLines.length);
            }
        });

        socket.on('k8s:log:end', () => {
            setStreamEnded(true);
            setIsConnected(false);
        });

        socket.on('k8s:log:error', (data: { message: string }) => {
            setError(data.message);
            setIsConnected(false);
        });

        return () => {
            socket.emit('k8s:stop:logs');
            socket.disconnect();
        };
    }, [namespace, podName, deploymentName, selectedContainer, tailLines]);

    const resume = () => {
        setIsPaused(false);
        setNewLogsCount(0);
        virtuosoRef.current?.scrollToIndex({ index: logs.length - 1, align: 'end', behavior: 'smooth' });
    };

    const k8sServiceName = `k8s:${namespace}:${podName?.split('-')[0] || deploymentName || 'unknown'}`;

    // Fetch recent AI summary
    useEffect(() => {
        if (!k8sServiceName) return;
        apiClient.getRecentSummary(k8sServiceName)
            .then(res => {
                if (res.available) {
                    setRecentSummaryData(res.summary);
                } else {
                    setRecentSummaryData(null);
                }
            })
            .catch(err => console.error('Failed to fetch recent summary', err));
    }, [k8sServiceName]);

    const handleSummarize = async () => {
        if (logs.length === 0) return;
        setSummarizing(true);
        try {
            // Map LogLine to expected LogEntry format and send only the last 200 logs
            const logsToSummarize = logs.slice(-200).map(l => ({
                _id: String(l.id),
                timestamp: new Date().toISOString(),
                level: l.level.toUpperCase(),
                message: l.content,
                sourceName: k8sServiceName
            }));
            const data = await apiClient.summarizeLogs(logsToSummarize, k8sServiceName);

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
                            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 sm:p-8"
                            onClick={() => setShowSummaryModal(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                className="relative w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl border border-primary/25 bg-[#0b0d12] shadow-[0_24px_80px_rgba(0,0,0,0.55)] flex flex-col"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="absolute inset-x-0 top-0 h-px bg-primary/70" />
                                <div className="px-6 py-5 border-b border-white/10 flex justify-between items-center bg-[linear-gradient(135deg,#101827_0%,#0b0d12_72%)]">
                                    <div>
                                        <p className="mb-1 text-[10px] font-semibold tracking-[0.16em] text-primary">kubiq Pro</p>
                                        <h3 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
                                            <AiStatusOrb activity={summarizing ? 'searching' : 'thinking'} />
                                            AI Log Analysis
                                        </h3>
                                    </div>
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
                                <div className="p-5 sm:p-6 overflow-y-auto custom-scrollbar font-sans text-gray-300 text-sm leading-relaxed bg-[#0b0d12]">
                                    {summarizing ? (
                                        <div className="flex flex-col items-center justify-center py-12">
                                            <AiStatusOrb activity="searching" size={64} />
                                            <p className="mt-4 text-sm font-medium text-white">Thinking through your logs…</p>
                                            <p className="mt-1 text-xs text-gray-500">Building a concise incident summary.</p>
                                        </div>
                                    ) : summary ? (
                                        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-5 prose prose-invert max-w-none">
                                            <ReactMarkdown>{summary}</ReactMarkdown>
                                        </div>
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

            <ProUpgradeModal isOpen={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />
        </>
    );

    return (
        <div className="flex flex-col h-full bg-[#0d0d0d] font-mono text-xs overflow-hidden">
            {modals}
            {/* ── Toolbar ────────────────────────────────────────── */}
            <div className="flex flex-row items-center gap-2 px-3 py-2 border-b border-gray-800 bg-[#111111] shrink-0 flex-wrap">
                
                {/* Tab Switcher */}
                <div className="flex bg-black/40 rounded-lg p-1 mr-2 border border-gray-800">
                    <button
                        onClick={() => setActiveTab('live')}
                        className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-medium transition-all rounded ${
                            activeTab === 'live' ? 'bg-[#2a2d36] text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                        }`}
                    >
                        <Activity className="w-3 h-3" /> Live
                    </button>
                    <button
                        onClick={() => setActiveTab('search')}
                        className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-medium transition-all rounded ${
                            activeTab === 'search' ? 'bg-[#2a2d36] text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                        }`}
                    >
                        <Search className="w-3 h-3" /> Search
                    </button>
                </div>

                {activeTab === 'live' && (
                    <>
                        {/* Connection Badge */}
                        {isConnected ? (
                    <span className="flex items-center gap-1.5 text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20 shrink-0">
                        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                        LIVE
                    </span>
                ) : streamEnded ? (
                    <span className="flex items-center gap-1.5 text-[10px] text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700 shrink-0">
                        ENDED
                    </span>
                ) : (
                    <span className="flex items-center gap-1.5 text-[10px] text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/20 shrink-0">
                        <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
                        CONNECTING
                    </span>
                )}

                {/* Container Selector */}
                {containers.length > 1 && (
                    <div className="relative">
                        <button
                            onClick={() => setContainerDropdownOpen(o => !o)}
                            className="flex items-center gap-1 text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 hover:bg-primary/20 transition-colors"
                        >
                            <span>{selectedContainer}</span>
                            <ChevronDown className={`w-3 h-3 transition-transform ${containerDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {containerDropdownOpen && (
                            <div className="absolute top-full left-0 mt-1 bg-[#1a1a1a] border border-gray-700 rounded-lg shadow-xl z-50 min-w-[160px] py-1">
                                {containers.map(c => (
                                    <button
                                        key={c.name}
                                        onClick={() => { setSelectedContainer(c.name); setContainerDropdownOpen(false); }}
                                        className="w-full text-left px-3 py-1.5 text-[10px] hover:bg-white/5 flex items-center justify-between"
                                    >
                                        <span className={selectedContainer === c.name ? 'text-primary' : 'text-gray-300'}>{c.name}</span>
                                        {selectedContainer === c.name && <Check className="w-3 h-3 text-primary" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Tail Lines Selector */}
                <div className="relative">
                    <button
                        onClick={() => setTailDropdownOpen(o => !o)}
                        className="flex items-center gap-1 text-[10px] text-gray-400 bg-white/5 px-2 py-0.5 rounded border border-gray-700 hover:bg-white/10 transition-colors"
                    >
                        <span>Last {tailLines}</span>
                        <ChevronDown className={`w-3 h-3 transition-transform ${tailDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {tailDropdownOpen && (
                        <div className="absolute top-full left-0 mt-1 bg-[#1a1a1a] border border-gray-700 rounded-lg shadow-xl z-50 min-w-[100px] py-1">
                            {TAIL_OPTIONS.map(n => (
                                <button
                                    key={n}
                                    onClick={() => { setTailLines(n); setTailDropdownOpen(false); }}
                                    className="w-full text-left px-3 py-1.5 text-[10px] hover:bg-white/5 flex items-center justify-between"
                                >
                                    <span className={tailLines === n ? 'text-primary' : 'text-gray-300'}>Last {n}</span>
                                    {tailLines === n && <Check className="w-3 h-3 text-primary" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Search / Filter logs */}
                <div className="relative flex-1 min-w-[120px] flex items-center bg-white/[0.03] border border-gray-800 focus-within:border-primary/40 rounded px-2 py-0.5 gap-1.5 transition-all">
                    <Search className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search or Regex logs..."
                        className="bg-transparent text-[10px] text-gray-200 placeholder-gray-500 outline-none w-full font-mono py-0.5"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="p-0.5 hover:bg-white/10 rounded text-gray-500 hover:text-white transition-colors">
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>

                <div className="ml-auto flex items-center gap-1">
                    {/* Pause / Resume */}
                    <button
                        onClick={() => { isPaused ? resume() : setIsPaused(true); }}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] transition-colors ${isPaused ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' : 'bg-white/5 border-gray-700 text-gray-400 hover:text-white'}`}
                        title={isPaused ? 'Resume tailing' : 'Pause tailing'}
                    >
                        {isPaused ? <><Pause className="w-3 h-3" /> Paused</> : <><Play className="w-3 h-3" /> Tailing</>}
                    </button>
                    {/* Clear */}
                    <button
                        onClick={() => { setLogs([]); setNewLogsCount(0); }}
                        className="p-1 text-gray-500 hover:text-red-400 hover:bg-white/5 rounded transition-colors"
                        title="Clear buffer"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    </div>
                </>
                )}
            </div>

            {activeTab === 'search' ? (
                <div className="flex-1 overflow-hidden relative">
                    <LogSearch serviceName={k8sServiceName} />
                </div>
            ) : (
            <>
                {/* ── Error Banner ───────────────────────────────────── */}
            {error && (
                <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 text-xs text-red-400 shrink-0">
                    ⚠️ {error}
                </div>
            )}

            {/* ── Stream Ended Banner ────────────────────────────── */}
            {streamEnded && (
                <div className="bg-gray-800/50 border-b border-gray-700 px-4 py-2 text-xs text-gray-500 text-center shrink-0">
                    Stream ended — pod may have terminated or completed.
                </div>
            )}

            {/* ── Log Output ─────────────────────────────────────── */}
            <div className="flex-1 relative min-h-0">
                {/* New lines badge */}
                {newLogsCount > 0 && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
                        <button
                            onClick={resume}
                            className="flex items-center gap-2 bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg transition-all animate-bounce text-xs"
                        >
                            <ArrowDown className="w-3.5 h-3.5" />
                            {newLogsCount} new line{newLogsCount !== 1 ? 's' : ''}
                        </button>
                    </div>
                )}

                {logs.length === 0 && !error && (
                    <div className="flex items-center justify-center h-full text-gray-600 text-xs">
                        {isConnected ? 'Waiting for log output…' : 'Connecting…'}
                    </div>
                )}

                {filteredLogs.length === 0 && logs.length > 0 && (
                    <div className="flex items-center justify-center h-full text-gray-500 text-xs font-mono">
                        No logs match search query filter
                    </div>
                )}

                <Virtuoso
                    ref={virtuosoRef}
                    data={filteredLogs}
                    followOutput={isPaused ? false : 'auto'}
                    atBottomStateChange={(bottom) => {
                        if (bottom) setNewLogsCount(0);
                    }}
                    itemContent={(index, log) => (
                        <div className={`px-4 py-0.5 hover:bg-white/5 border-l-2 border-transparent hover:border-gray-600 flex gap-3 ${LEVEL_COLORS[log.level]}`}>
                            <span className="select-none opacity-30 w-8 text-right shrink-0 text-[10px] pt-px">{index + 1}</span>
                            <span className="break-all whitespace-pre-wrap flex-1 select-text leading-relaxed">{log.content}</span>
                        </div>
                    )}
                    className="h-full"
                />

                {/* AI Floating Button */}
                {logs.length > 0 && (
                    <div className="absolute bottom-6 right-6 z-20">
                        <button
                            onClick={handleSummarize}
                            disabled={summarizing}
                            className="group flex items-center gap-2 rounded-full border border-blue-300/15 bg-primary px-5 py-2.5 text-white shadow-[0_10px_28px_rgba(37,99,235,0.24)] transition-all hover:-translate-y-0.5 hover:bg-blue-500 disabled:cursor-wait disabled:opacity-70"
                        >
                            <AiStatusOrb activity={summarizing ? 'searching' : 'thinking'} />
                            <span className="font-sans font-medium text-sm">{summarizing ? 'Thinking through logs…' : 'Summarize with AI'}</span>
                        </button>
                        
                        {recentSummaryData && !summarizing && (
                            <div className="absolute bottom-full right-0 mb-3 w-64">
                                <button 
                                    onClick={() => {
                                        setSummary(recentSummaryData.summary);
                                        setShowSummaryModal(true);
                                    }}
                                    className="w-full rounded-xl border border-blue-300/20 bg-[#111822]/95 p-3 text-left shadow-[0_12px_32px_rgba(0,0,0,0.3)] transition-colors hover:border-blue-300/40 hover:bg-[#162235]"
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <AiStatusOrb activity="thinking" />
                                        <span className="text-xs font-semibold text-blue-100">AI insight available</span>
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
            </>
            )}
        </div>
    );
}
