import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, Code2 } from 'lucide-react';
import { COLLECTOR_CONFIG, INSTRUMENTATION_SNIPPETS } from '../utils/apmInstrumentation';
import type { SDKLanguage } from '../utils/apmInstrumentation';
import { useToast } from '../contexts/ToastContext';

export interface ApmInstrumentationModalProps {
    isOpen: boolean;
    onClose: () => void;
}


export function ApmInstrumentationModal({ isOpen, onClose }: Readonly<ApmInstrumentationModalProps>) {
    const [lang, setLang] = useState<SDKLanguage>('node');
    const [copied, setCopied] = useState(false);
    const { error } = useToast();
    const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (copyTimer.current !== null) clearTimeout(copyTimer.current); }, []);

    if (!isOpen) return null;

    const current = INSTRUMENTATION_SNIPPETS[lang];

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(`${current.install}\n\n${current.code}${lang === 'node' ? '' : '\n\n' + COLLECTOR_CONFIG}`);
            setCopied(true);
            if (copyTimer.current !== null) clearTimeout(copyTimer.current);
            copyTimer.current = setTimeout(() => setCopied(false), 2000);
        } catch {
            error('Unable to copy the instrumentation guide. Copy the displayed configuration manually.');
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button type="button" aria-label="Close instrumentation guide backdrop" className="absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity" onClick={onClose} />
            <div className="relative w-full max-w-3xl bg-[#111111] border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">

                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-800 bg-[#161616]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
                            <Code2 className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                Instrument New Service
                            </h3>
                            <p className="text-xs text-gray-400 font-mono">
                                Copy OpenTelemetry SDK snippets to start sending trace spans to kubiq APM
                            </p>
                        </div>
                    </div>
                    <button type="button" aria-label="Close instrumentation guide" onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-800 bg-[#141414] px-5 gap-2 pt-3">
                    {[
                        { id: 'node', label: 'Node.js' },
                        { id: 'python', label: 'Python' },
                        { id: 'go', label: 'Go' },
                        { id: 'java', label: 'Java' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setLang(tab.id as SDKLanguage)}
                            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors border-b-2 ${lang === tab.id ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Code Body */}
                <div className="p-6 overflow-y-auto space-y-4 font-mono text-xs custom-scrollbar flex-1">
                    <div className="space-y-1">
                        <span className="text-gray-400 text-[10px] uppercase tracking-wider font-bold">1. Package Installation</span>
                        <div className="bg-black/40 border border-gray-800 rounded-lg p-3 text-cyan-400 flex items-center justify-between">
                            <span>{current.install}</span>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400 text-[10px] uppercase tracking-wider font-bold">2. Tracing Configuration ({current.filename})</span>
                            <button
                                onClick={handleCopy}
                                className="flex items-center gap-1.5 px-3 py-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded text-[11px] font-semibold transition-all"
                            >
                                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                                {copied ? 'Copied Code' : 'Copy Snippet'}
                            </button>
                        </div>
                        <pre className="bg-[#181818] border border-gray-800 rounded-xl p-4 text-gray-200 overflow-x-auto text-[11px] leading-relaxed">
                            {current.code}
                        </pre>
                    </div>
                    {lang !== 'node' && <section className="space-y-2">
                        <h4 className="text-gray-400 text-[10px] uppercase tracking-wider font-bold">3. Required local Collector configuration</h4>
                        <p className="text-gray-400">Run a separate OpenTelemetry Collector with this configuration. Keep its receiver on loopback; it forwards authenticated JSON to kubiq over HTTPS.</p>
                        <pre className="bg-[#181818] border border-gray-800 rounded-xl p-4 text-gray-200 overflow-x-auto text-[11px] leading-relaxed">{COLLECTOR_CONFIG}</pre>
                    </section>}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-4 border-t border-gray-800 bg-[#161616]">
                    <span className="text-[11px] text-gray-500 font-mono">
                        Direct kubiq ingestion: <span className="text-primary font-bold">/api/apm/v1/traces (HTTP JSON)</span>
                    </span>
                    <button onClick={onClose} className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-medium transition-colors">
                        Close
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
