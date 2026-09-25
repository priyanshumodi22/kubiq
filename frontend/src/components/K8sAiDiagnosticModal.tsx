import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X, Copy, Check, RefreshCw, AlertTriangle } from 'lucide-react';
import { apiClient } from '../services/api';

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
                            <div className="bg-[#181818] border border-gray-800 rounded-xl p-5 space-y-3 font-sans leading-normal">
                                {diagnosis.split('\n').map((line, idx) => {
                                    if (line.startsWith('### ')) {
                                        return (
                                            <h4 key={idx} className="text-sm font-bold text-white pt-2 border-b border-white/5 pb-1 uppercase tracking-wider flex items-center gap-2">
                                                {line.replace('### ', '')}
                                            </h4>
                                        );
                                    }
                                    if (line.startsWith('#### ')) {
                                        return (
                                            <h5 key={idx} className="text-xs font-semibold text-primary pt-1">
                                                {line.replace('#### ', '')}
                                            </h5>
                                        );
                                    }
                                    if (line.startsWith('> ')) {
                                        return (
                                            <div key={idx} className="bg-primary/5 border-l-2 border-primary p-3 rounded text-xs text-gray-300 my-2">
                                                {line.replace('> ', '')}
                                            </div>
                                        );
                                    }
                                    if (line.startsWith('```')) {
                                        return null;
                                    }
                                    return (
                                        <p key={idx} className={line.startsWith('- ') ? 'pl-4 text-gray-300 text-xs font-mono' : 'text-xs text-gray-300'}>
                                            {line}
                                        </p>
                                    );
                                })}
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
