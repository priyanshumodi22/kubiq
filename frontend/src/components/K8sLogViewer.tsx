import { useEffect, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import io from 'socket.io-client';
import { Play, Pause, Trash2, ArrowDown, ChevronDown, Check } from 'lucide-react';

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
    const lower = content.toLowerCase();
    if (/\b(error|exception|fatal|panic|critical)\b/.test(lower)) return 'error';
    if (/\b(warn|warning)\b/.test(lower)) return 'warn';
    if (/\b(info|information)\b/.test(lower)) return 'info';
    if (/\b(debug|trace)\b/.test(lower)) return 'debug';
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
    const [isConnected, setIsConnected] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [newLogsCount, setNewLogsCount] = useState(0);
    const [streamEnded, setStreamEnded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const socketRef = useRef<any>(null);
    const virtuosoRef = useRef<any>(null);
    const isPausedRef = useRef(isPaused);
    isPausedRef.current = isPaused;

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

    return (
        <div className="flex flex-col h-full bg-[#0d0d0d] font-mono text-xs overflow-hidden">
            {/* ── Toolbar ────────────────────────────────────────── */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 bg-[#111111] shrink-0 flex-wrap">
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
            </div>

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

                <Virtuoso
                    ref={virtuosoRef}
                    data={logs}
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
            </div>
        </div>
    );
}
