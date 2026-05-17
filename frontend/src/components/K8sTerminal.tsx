import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { Terminal as XtermTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Terminal, RefreshCw, AlertTriangle, ChevronDown } from 'lucide-react';

interface K8sTerminalProps {
    namespace: string;
    podName: string;
    containers: Array<{ name: string }>;
}

export default function K8sTerminal({ namespace, podName, containers }: K8sTerminalProps) {
    const [selectedContainer, setSelectedContainer] = useState<string>(
        containers[0]?.name || 'main'
    );
    const [connected, setConnected] = useState(false);
    const [connecting, setConnecting] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XtermTerminal | null>(null);
    const socketRef = useRef<any>(null);

    const backendUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
    const contextPath = import.meta.env.VITE_BACKEND_CONTEXT_PATH || '';

    useEffect(() => {
        if (!terminalRef.current) return;

        let term: XtermTerminal | null = null;
        let socket: any = null;
        let resizeObserver: ResizeObserver | null = null;

        // Delay terminal setup by a tiny tick to ensure browser layout engine
        // has fully rendered and sized the DOM container. This guarantees the very
        // first fitAddon.fit() calculation captures the actual wide container dimensions!
        const initTimer = setTimeout(() => {
            if (!terminalRef.current) return;

            setConnecting(true);
            setConnected(false);
            setError(null);

            // Initialize xterm
            term = new XtermTerminal({
                cursorBlink: true,
                fontSize: 11,
                fontFamily: 'Consolas, "Fira Code", monospace',
                theme: {
                    background: '#0a0a0a',
                    foreground: '#e2e8f0', // slate-200
                    cursor: '#10b981', // emerald-500
                    cursorAccent: '#0a0a0a',
                    selectionBackground: '#1e293b', // slate-800
                    black: '#000000',
                    red: '#ef4444',
                    green: '#10b981',
                    yellow: '#f59e0b',
                    blue: '#3b82f6',
                    magenta: '#d946ef',
                    cyan: '#06b6d4',
                    white: '#cbd5e1'
                },
                convertEol: true,
                scrollback: 1000
            });

            const fitAddon = new FitAddon();
            term.loadAddon(fitAddon);
            term.open(terminalRef.current);
            fitAddon.fit();
            xtermRef.current = term;

            term.write('\r\n\u001b[1;33m⚡ INITIALIZING SECURE CONTAINER TTY HANDSHAKE...\u001b[0m\r\n');

            socket = io(backendUrl, {
                path: `${contextPath}/socket.io`,
                transports: ['websocket'],
                forceNew: true
            });
            socketRef.current = socket;

            const handleResize = () => {
                if (!term || !terminalRef.current) return;
                try {
                    fitAddon.fit();
                    socket.emit('k8s:terminal:resize', {
                        cols: term.cols,
                        rows: term.rows
                    });
                } catch (e) {}
            };

            resizeObserver = new ResizeObserver(() => {
                setTimeout(handleResize, 50);
            });
            resizeObserver.observe(terminalRef.current);

            term.onData((data) => {
                socket.emit('k8s:terminal:input', { text: data });
            });

            socket.on('connect', () => {
                socket.emit('k8s:start:terminal', {
                    namespace,
                    podName,
                    container: selectedContainer,
                    cols: term!.cols,
                    rows: term!.rows
                });
            });

            socket.on('k8s:terminal:ready', () => {
                setConnecting(false);
                setConnected(true);
                term!.reset();
                term!.write(`\r\n\u001b[1;32m☸️  CONNECTED TO CONTAINER: ${podName} (${selectedContainer})\u001b[0m\r\n`);
                term!.write(`\u001b[1;36m🔧 Interactive shell session active (bash / sh)\u001b[0m\r\n`);
                term!.write(`\u001b[1;33m💡 Tip: Keystrokes, arrows, backspaces, tab completion function natively.\u001b[0m\r\n`);
                term!.write(`------------------------------------------------------------\r\n\r\n`);
                term!.focus();
                setTimeout(handleResize, 100);
            });

            socket.on('k8s:terminal:output', (data: string) => {
                term!.write(data);
            });

            socket.on('k8s:terminal:exit', (status: any) => {
                term!.write(`\r\n\u001b[1;31m[Session exited with code ${status?.code || 0}]\u001b[0m\r\n`);
                setConnected(false);
            });

            socket.on('k8s:terminal:error', (err: { message: string }) => {
                setError(err.message);
                setConnecting(false);
            });

            socket.on('disconnect', () => {
                setConnected(false);
            });

        }, 150);

        return () => {
            clearTimeout(initTimer);
            if (resizeObserver) resizeObserver.disconnect();
            if (term) term.dispose();
            if (socket) {
                socket.emit('k8s:stop:terminal');
                socket.disconnect();
            }
        };
    }, [namespace, podName, selectedContainer]);

    const reconnect = () => {
        setError(null);
        setConnecting(true);
        xtermRef.current?.reset();
        xtermRef.current?.write('\r\n\u001b[1;33m⚡ RECONNECTING SECURE CONTAINER TTY HANDSHAKE...\u001b[0m\r\n');
        socketRef.current?.disconnect();
        socketRef.current?.connect();
    };

    return (
        <div className="flex flex-col h-full bg-[#0a0a0a] overflow-hidden relative border border-white/5 shadow-inner">
            {/* Terminal Window Header Chrome */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
                <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[10px] font-bold text-gray-400 tracking-wide uppercase font-mono">Container Interactive TTY</span>
                </div>
                <div className="flex items-center gap-3 font-mono">
                    {/* Multi-container Dropdown Selector */}
                    {containers.length > 1 ? (
                        <div className="relative flex items-center bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 rounded px-2 py-0.5 transition-colors cursor-pointer group">
                            <span className="text-[9px] text-gray-500 font-bold mr-1.5 uppercase select-none">Container:</span>
                            <select 
                                value={selectedContainer}
                                onChange={(e) => setSelectedContainer(e.target.value)}
                                className="bg-transparent text-[10px] text-gray-300 font-bold outline-none cursor-pointer pr-4 appearance-none relative z-10"
                            >
                                {containers.map((c) => (
                                    <option key={c.name} value={c.name} className="bg-[#121212] text-gray-300">
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="w-3 h-3 text-gray-500 absolute right-1.5 pointer-events-none group-hover:text-gray-300 transition-colors" />
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 bg-white/[0.02] border border-white/5 px-2 py-0.5 rounded text-[9px] text-gray-400">
                            <span className="text-gray-500 font-bold">CONTAINER:</span>
                            <span>{selectedContainer}</span>
                        </div>
                    )}

                    <div className="flex items-center gap-1.5 bg-white/[0.02] border border-white/5 px-2 py-0.5 rounded text-[9px] text-gray-400">
                        <span className="text-gray-500 font-bold">NS:</span>
                        <span>{namespace}</span>
                    </div>

                    {connected ? (
                        <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[9px] uppercase tracking-wider select-none">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>Live Session</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 text-gray-500 font-bold text-[9px] uppercase tracking-wider select-none">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                            <span>Disconnected</span>
                        </div>
                    )}

                    <button 
                        onClick={reconnect}
                        className="p-1 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors"
                        title="Reconnect Session"
                    >
                        <RefreshCw className="w-3 h-3" />
                    </button>
                </div>
            </div>

            {/* Terminal Render Container */}
            <div className="flex-1 p-2 bg-[#0a0a0a] overflow-hidden relative">
                {connecting && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0a0a0a]/90 backdrop-blur-sm space-y-4">
                        <div className="relative flex items-center justify-center">
                            <div className="w-10 h-10 border-2 border-emerald-400/20 border-t-emerald-400 rounded-full animate-spin" />
                            <Terminal className="w-4 h-4 text-emerald-400 absolute" />
                        </div>
                        <div className="text-center space-y-1 font-mono">
                            <p className="text-[10px] text-emerald-400 font-bold animate-pulse tracking-wide uppercase">Connecting container TTY...</p>
                            <p className="text-[9px] text-gray-500">Spawning bash session via k8s.Exec streams</p>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0a0a0a]/95 space-y-4 p-6 text-center font-mono">
                        <AlertTriangle className="w-10 h-10 text-red-400 animate-bounce" />
                        <div className="space-y-1.5 max-w-sm">
                            <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider">TTY Connection Failed</p>
                            <p className="text-[9px] text-gray-400 leading-relaxed bg-red-950/20 border border-red-500/10 p-3 rounded">{error}</p>
                        </div>
                        <button 
                            onClick={reconnect}
                            className="bg-white/5 hover:bg-white/10 text-white border border-white/10 px-4 py-1.5 rounded text-[10px] font-bold tracking-wide transition-all uppercase"
                        >
                            Retry Handshake
                        </button>
                    </div>
                )}

                <div 
                    ref={terminalRef} 
                    className="w-full h-full text-slate-200"
                />
            </div>
        </div>
    );
}
