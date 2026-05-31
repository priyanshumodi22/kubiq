import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Virtuoso } from 'react-virtuoso';
import { Search, Clock, Filter, Sparkles, RefreshCw, AlertCircle, X, Lock, CheckCircle2, Zap, ChevronDown, Copy } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { apiClient } from '../services/api';

interface LogSearchProps {
    serviceName: string;
}

interface LogEntry {
    _id: string;
    timestamp: string;
    level: string;
    message: string;
    sourceName: string;
}

const LEVEL_COLORS: Record<string, string> = {
    ERROR: 'text-red-400 bg-red-400/10 border-red-400/20',
    WARN: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    INFO: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    DEBUG: 'text-gray-400 bg-gray-400/10 border-gray-400/20',
    ALL: 'text-white bg-white/10 border-white/20',
};

interface CustomSelectProps {
    value: string | number;
    onChange: (val: any) => void;
    options: { label: string; value: string | number }[];
    disabled?: boolean;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ value, onChange, options, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(o => o.value === value) || options[0];

    return (
        <div ref={wrapperRef} className="relative w-full min-w-[140px]">
            <button
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-between bg-[#0d0d0d] border border-gray-700 text-sm rounded-md px-3 py-1.5 text-gray-200 focus:border-blue-500 focus:outline-none transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-600'}`}
                disabled={disabled}
            >
                <span className="truncate pr-2">{selectedOption?.label || 'Select...'}</span>
                <ChevronDown className="w-3 h-3 text-gray-500 flex-shrink-0" />
            </button>
            
            {isOpen && !disabled && (
                <div className="absolute top-full left-0 w-full mt-1 bg-[#1d1f24] border border-gray-700 rounded-md shadow-xl z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700">
                    {options.map((opt) => (
                        <button
                            key={opt.value}
                            onClick={() => {
                                onChange(opt.value);
                                setIsOpen(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs flex items-center transition-colors hover:bg-white/5 ${
                                value === opt.value ? 'text-blue-400 font-medium' : 'text-gray-300'
                            }`}
                        >
                            <span className="truncate">{opt.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export const LogSearch: React.FC<LogSearchProps> = ({ serviceName }) => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [sources, setSources] = useState<string[]>([]);

    // Filters
    const [timeRange, setTimeRange] = useState<number>(24 * 60 * 60 * 1000); // 24h default
    const [level, setLevel] = useState<string>('ALL');
    const [source, setSource] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    // AI Summary
    const [summary, setSummary] = useState<string | null>(null);
    const [summarizing, setSummarizing] = useState(false);
    const [showSummaryModal, setShowSummaryModal] = useState(false);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [recentSummaryData, setRecentSummaryData] = useState<{ summary: string, timestamp: number } | null>(null);

    useEffect(() => {
        fetchSources();
        handleSearch(); // initial search
        
        // Fetch recent AI summary
        if (!serviceName) return;
        apiClient.getRecentSummary(serviceName)
            .then(res => {
                if (res.available) {
                    setRecentSummaryData(res.summary);
                } else {
                    setRecentSummaryData(null);
                }
            })
            .catch(err => console.error('Failed to fetch recent summary', err));
    }, [serviceName]);

    const fetchSources = async () => {
        try {
            const data = await apiClient.getLogSources(serviceName);
            setSources(data);
        } catch (err) {
            console.error('Failed to fetch sources:', err);
        }
    };

    const handleSearch = async () => {
        setLoading(true);
        setSummary(null);
        try {
            const toMs = Date.now();
            const fromMs = toMs - timeRange;

            const params = new URLSearchParams({
                serviceName,
                fromMs: fromMs.toString(),
                toMs: toMs.toString(),
            });

            if (level !== 'ALL') params.append('level', level);
            if (source !== 'ALL') params.append('sourceName', source);
            if (searchQuery.trim()) params.append('search', searchQuery.trim());

            const data = await apiClient.queryLogs(params);
            setLogs(data);
        } catch (err) {
            console.error('Failed to fetch logs:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSummarize = async () => {
        if (logs.length === 0) return;
        setSummarizing(true);
        try {
            // Send only the last 200 logs to prevent massive payloads and 413 errors
            const data = await apiClient.summarizeLogs(logs.slice(-200), serviceName);

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

    return (
        <div className="flex flex-col h-full bg-[#0d0d0d] font-sans">
            {/* Filters Header */}
            <div className="bg-[#111111] border-b border-gray-800 p-4 flex flex-wrap gap-4 items-end z-10">
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1">
                        <Search className="w-3 h-3" /> Search Text
                    </label>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="e.g. error connecting..."
                        className="w-full bg-[#0d0d0d] border border-gray-700 text-sm rounded-md px-3 py-1.5 text-gray-200 focus:border-blue-500 focus:outline-none"
                    />
                </div>

                <div>
                    <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Time Range
                    </label>
                    <CustomSelect 
                        value={timeRange}
                        onChange={(val) => setTimeRange(Number(val))}
                        options={[
                            { label: 'Last 1 Hour', value: 60 * 60 * 1000 },
                            { label: 'Last 6 Hours', value: 6 * 60 * 60 * 1000 },
                            { label: 'Last 24 Hours', value: 24 * 60 * 60 * 1000 },
                            { label: 'Last 7 Days', value: 7 * 24 * 60 * 60 * 1000 }
                        ]}
                    />
                </div>

                <div>
                    <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1">
                        <Filter className="w-3 h-3" /> Level
                    </label>
                    <CustomSelect 
                        value={level}
                        onChange={(val) => setLevel(String(val))}
                        options={[
                            { label: 'All Levels', value: 'ALL' },
                            { label: 'Error', value: 'ERROR' },
                            { label: 'Warn', value: 'WARN' },
                            { label: 'Info', value: 'INFO' },
                            { label: 'Debug', value: 'DEBUG' }
                        ]}
                    />
                </div>

                <div>
                    <label className="block text-xs text-gray-400 mb-1">Source</label>
                    <CustomSelect 
                        value={source}
                        onChange={(val) => setSource(String(val))}
                        disabled={sources.length === 0}
                        options={sources.length === 0 
                            ? [{ label: 'No sources available', value: 'ALL' }]
                            : [
                                { label: 'All Sources', value: 'ALL' },
                                ...sources.map(s => ({ label: s.split(/[/\\]/).pop() || s, value: s }))
                            ]
                        }
                    />
                </div>

                <button
                    onClick={handleSearch}
                    disabled={loading}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Search
                </button>
            </div>

            {/* Results Area */}
            <div className="flex-1 relative font-mono text-xs overflow-hidden">
                {logs.length > 0 ? (
                    <Virtuoso
                        data={logs}
                        itemContent={(_, log) => (
                            <div className={`px-4 py-1.5 hover:bg-white/5 border-b border-gray-800/50 flex flex-col gap-1`}>
                                <div className="flex items-center gap-3 text-[10px] text-gray-500">
                                    <span className="shrink-0">{new Date(log.timestamp).toLocaleString()}</span>
                                    <span className={`px-1.5 rounded border ${LEVEL_COLORS[log.level] || LEVEL_COLORS.ALL}`}>{log.level}</span>
                                    <span className="truncate max-w-[200px]" title={log.sourceName}>{log.sourceName.split(/[/\\]/).pop()}</span>
                                </div>
                                <div className={`pl-[130px] whitespace-pre-wrap break-all ${LEVEL_COLORS[log.level]?.split(' ')[0] || 'text-gray-300'}`}>
                                    {log.message}
                                </div>
                            </div>
                        )}
                        className="h-full scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent"
                    />
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500">
                        <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
                        <p>{loading ? 'Searching logs...' : 'No logs found matching your criteria.'}</p>
                    </div>
                )}

                {/* AI Floating Button */}
                {logs.length > 0 && (
                    <div className="absolute bottom-6 right-6 z-20">
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

            {/* AI Summary Modal — portal to body to escape stacking context */}
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
                                    <button
                                        onClick={() => setShowUpgradeModal(false)}
                                        className="absolute top-4 right-4 text-gray-500 hover:text-white bg-gray-800/50 hover:bg-gray-700/50 p-1.5 rounded-full transition-colors"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg mb-6 transform rotate-3">
                                        <Lock className="w-8 h-8 text-white" />
                                    </div>
                                    <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-2 font-sans">Unlock kubiq Pro</h2>
                                    <p className="text-gray-400 text-sm mb-8 max-w-sm">Get instant AI-driven root cause analysis for your logs. Troubleshoot issues 10x faster.</p>
                                    <div className="w-full space-y-4 mb-8 text-left bg-gray-900/50 p-5 rounded-xl border border-gray-800/50">
                                        <div className="flex items-center gap-3 text-sm text-gray-300">
                                            <CheckCircle2 className="w-5 h-5 text-purple-400 shrink-0" />
                                            <span>Instant AI Root Cause Analysis</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm text-gray-300">
                                            <CheckCircle2 className="w-5 h-5 text-blue-400 shrink-0" />
                                            <span>Anomaly &amp; Pattern Detection</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm text-gray-300">
                                            <Zap className="w-5 h-5 text-yellow-400 shrink-0" />
                                            <span><strong>BYOK:</strong> Support for OpenAI, Anthropic, &amp; Gemini</span>
                                        </div>
                                    </div>
                                    <a
                                        href="https://polar.sh/kubiq"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-medium py-3 px-6 rounded-xl transition-all shadow-[0_0_20px_rgba(147,51,234,0.3)] hover:shadow-[0_0_30px_rgba(147,51,234,0.5)] transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
                                    >
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
        </div>
    );
};
