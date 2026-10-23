import React, { useState, useEffect, useRef, useId, useCallback } from 'react';
import { isAxiosError } from 'axios';
import { createPortal } from 'react-dom';
import { Virtuoso } from 'react-virtuoso';
import { Search, Clock, Filter, RefreshCw, AlertCircle, X, ChevronDown, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiClient } from '../services/api';
import { ProUpgradeModal } from './ProUpgradeModal';
import { AiStatusOrb } from './AiStatusOrb';
import { LogSummaryBody } from './LogSummaryBody';

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

const renderSearchLogRow = (_index: number, log: LogEntry) => (
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
    );

interface CustomSelectProps {
    id: string;
    value: string | number;
    onChange: (val: string | number) => void;
    options: { label: string; value: string | number }[];
    disabled?: boolean;
}

const CustomSelect = ({ id, value, onChange, options, disabled }: Readonly<CustomSelectProps>) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
    useEffect(() => {
        if (isOpen && !disabled) {
            const selected = Math.max(0, options.findIndex(option => option.value === value));
            optionRefs.current[selected]?.focus();
        }
    }, [isOpen, disabled, options, value]);
    const close = () => { setIsOpen(false); triggerRef.current?.focus(); };
    const handleOptionKey = (event: React.KeyboardEvent, index: number) => {
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            optionRefs.current[(index + direction + options.length) % options.length]?.focus();
        }
        if (event.key === 'Home') { event.preventDefault(); optionRefs.current[0]?.focus(); }
        if (event.key === 'End') { event.preventDefault(); optionRefs.current[options.length - 1]?.focus(); }
    };

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
                id={id} type="button" ref={triggerRef}
                aria-expanded={isOpen && !disabled} aria-controls={isOpen && !disabled ? `${id}-options` : undefined}
                onKeyDown={event => {
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setIsOpen(true); }
                    if (event.key === 'Escape') close();
                }}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-between bg-[#0d0d0d] border border-gray-700 text-sm rounded-md px-3 py-1.5 text-gray-200 focus:border-blue-500 focus:outline-none transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-600'}`}
                disabled={disabled}
            >
                <span className="truncate pr-2">{selectedOption?.label || 'Select...'}</span>
                <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" />
            </button>
            
            {isOpen && !disabled && (
                <div id={`${id}-options`} className="absolute top-full left-0 w-full mt-1 bg-[#1d1f24] border border-gray-700 rounded-md shadow-xl z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700">
                    {options.map((opt, index) => (
                        <button
                            type="button" aria-pressed={value === opt.value}
                            ref={element => { optionRefs.current[index] = element; }}
                            onKeyDown={event => handleOptionKey(event, index)}
                            key={opt.value}
                            onClick={() => {
                                onChange(opt.value);
                                close();
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs flex items-center transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-primary ${
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
    const fieldId = useId();
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

    const searchGeneration = useRef(0);
    const serviceGeneration = useRef(0);

    const handleSearch = useCallback(async () => {
        const generation = ++searchGeneration.current;
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
            if (generation === searchGeneration.current) setLogs(data);
        } catch (err) {
            console.error('Failed to fetch logs:', err);
        } finally {
            if (generation === searchGeneration.current) setLoading(false);
        }
    }, [serviceName, timeRange, level, source, searchQuery]);

    const latestSearch = useRef(handleSearch);
    useEffect(() => { latestSearch.current = handleSearch; }, [handleSearch]);
    const invalidateRequests = useCallback(() => {
        searchGeneration.current++;
        serviceGeneration.current++;
    }, []);
    useEffect(() => {
        let active = true;
        setLogs([]);
        setSummarizing(false);
        setSources([]);
        setRecentSummaryData(null);
        void latestSearch.current();
        apiClient.getLogSources(serviceName).then(data => {
            if (active) setSources(data);
        }).catch(error_ => console.error('Failed to fetch sources:', error_));
        if (serviceName) {
            apiClient.getRecentSummary(serviceName).then(data => {
                if (active) setRecentSummaryData(data.available ? data.summary : null);
            }).catch(error_ => console.error('Failed to fetch recent summary', error_));
        }
        return () => { active = false; invalidateRequests(); };
    }, [serviceName, invalidateRequests]);

    const handleSummarize = async () => {
        if (logs.length === 0) return;
        const generation = serviceGeneration.current;
        setSummarizing(true);
        try {
            // Send only the last 200 logs to prevent massive payloads and 413 errors
            const data = await apiClient.summarizeLogs(logs.slice(-200), serviceName);
            if (generation !== serviceGeneration.current) return;

            setShowSummaryModal(true);
            if (data.summary) {
                setSummary(data.summary);
            } else {
                setSummary('Failed to generate summary.');
            }
        } catch (err) {
            if (generation !== serviceGeneration.current) return;
            console.error('Summarize error:', err);

            if (isAxiosError<{ error?: string }>(err) && (err.response?.status === 402 || ['NO_LICENSE', 'INVALID_LICENSE'].includes(err.response?.data?.error || ''))) {
                setShowUpgradeModal(true);
                return;
            }

            setShowSummaryModal(true);
            setSummary('Error communicating with summarization service.');
        } finally {
            if (generation === serviceGeneration.current) setSummarizing(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0d0d0d] font-sans">
            {/* Filters Header */}
            <div className="bg-[#111111] border-b border-gray-800 p-4 flex flex-wrap gap-4 items-end z-10">
                <div className="flex-1 min-w-[200px]">
                    <label htmlFor={`${fieldId}-search`} className="block text-xs text-gray-400 mb-1 flex items-center gap-1">
                        <Search className="w-3 h-3" /> Search Text
                    </label>
                    <input
                        id={`${fieldId}-search`}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="e.g. error connecting..."
                        className="w-full bg-[#0d0d0d] border border-gray-700 text-sm rounded-md px-3 py-1.5 text-gray-200 focus:border-blue-500 focus:outline-none"
                    />
                </div>

                <div>
                    <label htmlFor={`${fieldId}-time`} className="block text-xs text-gray-400 mb-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Time Range
                    </label>
                    <CustomSelect 
                        id={`${fieldId}-time`}
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
                    <label htmlFor={`${fieldId}-level`} className="block text-xs text-gray-400 mb-1 flex items-center gap-1">
                        <Filter className="w-3 h-3" /> Level
                    </label>
                    <CustomSelect 
                        id={`${fieldId}-level`}
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
                    <label htmlFor={`${fieldId}-source`} className="block text-xs text-gray-400 mb-1">Source</label>
                    <CustomSelect 
                        id={`${fieldId}-source`}
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
                        itemContent={renderSearchLogRow}
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
                            className="group flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-5 py-2.5 text-primary shadow-sm transition-all hover:-translate-y-0.5 hover:bg-primary/20 disabled:cursor-wait disabled:opacity-70"
                        >
                            <AiStatusOrb activity="searching" size={24} />
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

            {/* AI Summary Modal — portal to body to escape stacking context */}
            {createPortal(
                <AnimatePresence>
                    {showSummaryModal && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-9999 flex items-center justify-center p-8"
                            onClick={() => setShowSummaryModal(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                className="flex w-full max-w-3xl max-h-[85vh] flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#101116] shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex items-center justify-between border-b border-white/10 bg-[#15161b] px-6 py-5">
                                    <div>
                                        <p className="mb-1 text-[10px] font-semibold tracking-[0.16em] text-primary">kubiq Pro</p>
                                        <h3 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
                                            <AiStatusOrb activity="working" size={32} />
                                            AI log analysis
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
                                <div className="overflow-y-auto bg-[#0c0d11] p-5 font-sans text-sm leading-relaxed text-gray-300 custom-scrollbar sm:p-6">
                                    <LogSummaryBody summarizing={summarizing} summary={summary} />
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            <ProUpgradeModal isOpen={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />
        </div>
    );
};
