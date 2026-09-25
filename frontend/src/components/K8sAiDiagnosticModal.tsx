import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X, Copy, Check, RefreshCw, AlertTriangle } from 'lucide-react';
import { apiClient } from '../services/api';


function renderInlineMarkdown(text: string) {
    // Replace **bold** with <strong> and `code` with styled <code>
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i} className="font-bold text-white">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={i} className="bg-black/40 text-primary px-1.5 py-0.5 rounded text-[11px] font-mono border border-primary/20">{part.slice(1, -1)}</code>;
        }
        return part;
    });
}

function parseAndRenderMarkdown(markdownText: string) {
    if (!markdownText) return null;
    const lines = markdownText.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBlockLines: string[] = [];

    lines.forEach((line, idx) => {
        if (line.trim().startsWith('```')) {
            if (inCodeBlock) {
                elements.push(
                    <pre key={`code-${idx}`} className="bg-black/60 border border-white/10 rounded-lg p-3 text-[11px] font-mono text-emerald-400 overflow-x-auto my-2 whitespace-pre-wrap">
                        {codeBlockLines.join('\n')}
                    </pre>
                );
                codeBlockLines = [];
                inCodeBlock = false;
            } else {
                inCodeBlock = true;
            }
            return;
        }

        if (inCodeBlock) {
            codeBlockLines.push(line);
            return;
        }

        const trimmed = line.trim();
        if (!trimmed) {
            elements.push(<div key={`sp-${idx}`} className="h-1" />);
            return;
        }

        if (trimmed.startsWith('### ')) {
            elements.push(
                <h4 key={`h3-${idx}`} className="text-sm font-bold text-white pt-3 pb-1 border-b border-white/10 flex items-center gap-2 tracking-wide uppercase">
                    {renderInlineMarkdown(trimmed.replace('### ', ''))}
                </h4>
            );
            return;
        }

        if (trimmed.startsWith('#### ')) {
            elements.push(
                <h5 key={`h4-${idx}`} className="text-xs font-bold text-primary pt-2">
                    {renderInlineMarkdown(trimmed.replace('#### ', ''))}
                </h5>
            );
            return;
        }

        if (trimmed.startsWith('> [!TIP]') || trimmed.startsWith('> [!NOTE]') || trimmed.startsWith('> ')) {
            elements.push(
                <div key={`quote-${idx}`} className="bg-primary/10 border-l-2 border-primary px-3 py-2 rounded text-xs text-gray-300 my-2">
                    {renderInlineMarkdown(trimmed.replace(/^>\s*(\[!.*?\])?\s*/, ''))}
                </div>
            );
            return;
        }

        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            elements.push(
                <div key={`li-${idx}`} className="flex items-start gap-2 pl-2 text-xs text-gray-300 my-1">
                    <span className="text-primary mt-1">•</span>
                    <span>{renderInlineMarkdown(trimmed.replace(/^[-*]\s+/, ''))}</span>
                </div>
            );
            return;
        }

        elements.push(
            <p key={`p-${idx}`} className="text-xs text-gray-300 leading-relaxed my-1">
                {renderInlineMarkdown(line)}
            </p>
        );
    });

    if (inCodeBlock && codeBlockLines.length > 0) {
        elements.push(
            <pre key="code-end" className="bg-black/60 border border-white/10 rounded-lg p-3 text-[11px] font-mono text-emerald-400 overflow-x-auto my-2 whitespace-pre-wrap">
                {codeBlockLines.join('\n')}
            </pre>
        );
    }

    return elements;
}


export interface K8sAiDiagnosticModalProps {
    isOpen: boolean;
    onClose: () => void;
    namespace: string;
    podName?: string;
    event?: any;
    title?: string;
}

export function K8sAiDiagnosticModal({
    isOpen,
    onClose,
    namespace,
    podName,
    event,
    title = 'AI SRE Diagnostics'
}: K8sAiDiagnosticModalProps) {
    const [diagnosis, setDiagnosis] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const fetchDiagnosis = async () => {
        setLoading(true);
        setError(null);
        try {
            if (podName) {
                const res = await apiClient.aiDiagnosePod(namespace, podName);
                setDiagnosis(res.diagnosis || 'No diagnostic output returned.');
            } else if (event) {
                const res = await apiClient.aiDiagnoseEvent(namespace, event);
                setDiagnosis(res.diagnosis || 'No diagnostic output returned.');
            } else {
                setError('No target pod or event specified for diagnosis.');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to generate AI diagnosis.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchDiagnosis();
        }
    }, [isOpen, namespace, podName, event]);

    if (!isOpen) return null;

    const handleCopy = () => {
        navigator.clipboard.writeText(diagnosis);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity" onClick={onClose} />
            
            <div className="relative w-full max-w-2xl bg-[#111111] border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-in">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-800 bg-[#161616]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
                            <Sparkles className="w-5 h-5 animate-pulse" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                {title}
                                <span className="text-[10px] font-mono font-normal bg-white/10 text-gray-300 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                    Gemini SRE
                                </span>
                            </h3>
                            <p className="text-xs text-gray-400 font-mono">
                                {podName ? `Target Pod: ${namespace}/${podName}` : `Warning Event Analysis: ${event?.reason || 'Event'}`}
                            </p>
                        </div>
                    </div>
                    
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 font-sans text-sm text-gray-200 leading-relaxed custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
                            <div className="relative">
                                <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                                <Sparkles className="w-5 h-5 text-primary absolute inset-0 m-auto animate-pulse" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-gray-200">Generating Root Cause Diagnosis...</p>
                                <p className="text-xs text-gray-500 font-mono mt-1">Analyzing log streams, exit codes, and container spec limits</p>
                            </div>
                        </div>
                    ) : error ? (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5 text-red-400 flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-sm font-semibold">Diagnostic Failed</p>
                                <p className="text-xs opacity-80">{error}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="bg-[#141414] border border-gray-800/80 rounded-xl p-5 space-y-3 font-sans leading-relaxed text-xs text-gray-200 shadow-inner">
                                {parseAndRenderMarkdown(diagnosis)}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-4 border-t border-gray-800 bg-[#161616]">
                    <button
                        onClick={fetchDiagnosis}
                        disabled={loading}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Re-diagnose
                    </button>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleCopy}
                            disabled={loading || !diagnosis}
                            className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
                        >
                            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                            {copied ? 'Copied to Clipboard' : 'Copy Diagnosis'}
                        </button>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-medium transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
