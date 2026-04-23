import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Clock, AlertTriangle, Search, Server, X, ChevronDown } from 'lucide-react';
import { useApm } from '../hooks/useApm';
import { useTrace } from '../hooks/useTrace';
import { useServiceMap } from '../hooks/useServiceMap';
import TraceWaterfall from '../components/TraceWaterfall';
import ServiceMap from '../components/ServiceMap';

export default function ApmDashboard() {
    const { metrics, loading: apmLoading, error: apmError, refresh } = useApm();
    const { spans, loading: traceLoading, error: traceError, fetchTrace, clearTrace } = useTrace();
    const { dependencies, loading: mapLoading, error: mapError, fetchServiceMap } = useServiceMap();

    const [timeRange, setTimeRange] = useState(60 * 60 * 1000); // Default 1H
    const [traceIdInput, setTraceIdInput] = useState('');
    const [serviceFilter, setServiceFilter] = useState('');
    const [activeView, setActiveView] = useState<'metrics' | 'map'>('metrics');
    const [selectedMapService, setSelectedMapService] = useState<string | null>(null);

    // Split Layout State
    const [selectedInspectorService, setSelectedInspectorService] = useState<string | null>(null);
    const [tracesList, setTracesList] = useState<any[]>([]);
    const [isFetchingTraces, setIsFetchingTraces] = useState(false);

    const sidebarRef = useRef<HTMLDivElement>(null);
    const timeRangeTriggerRef = useRef<HTMLButtonElement>(null);
    const timeRangePanelRef  = useRef<HTMLDivElement>(null);
    const [isTimeRangeOpen, setIsTimeRangeOpen] = useState(false);
    const [timeRangeRect, setTimeRangeRect] = useState<{ top: number; left: number; width: number } | null>(null);

    const filteredMetrics = metrics.filter(m =>
        m.serviceName.toLowerCase().includes(serviceFilter.toLowerCase().trim())
    );

    // Close sidebar on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
                setSelectedMapService(null);
            }
        }
        if (selectedMapService) {
            document.addEventListener('mousedown', handleClickOutside);
        } else {
            document.removeEventListener('mousedown', handleClickOutside);
        }
        return () => { document.removeEventListener('mousedown', handleClickOutside); };
    }, [selectedMapService]);

    // Close time range dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!timeRangeTriggerRef.current?.contains(t) && !timeRangePanelRef.current?.contains(t)) {
                setIsTimeRangeOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Fetch map data when switching to map view
    useEffect(() => {
        if (activeView === 'map') {
            fetchServiceMap(timeRange);
        }
    }, [activeView, timeRange, fetchServiceMap]);

    const handleRefresh = () => {
        refresh(timeRange);
        if (activeView === 'map') {
            fetchServiceMap(timeRange);
        }
    };

    const handleServiceClick = async (serviceName: string) => {
        setSelectedInspectorService(serviceName);
        window.scrollTo({ top: 0, behavior: 'smooth' });

        try {
            setIsFetchingTraces(true);
            const baseUrl = import.meta.env.VITE_API_URL || '';
            const ctxPath = import.meta.env.VITE_BACKEND_CONTEXT_PATH || '';
            // Fetch the 50 most recent traces list
            const res = await fetch(`${baseUrl}${ctxPath}/api/apm/services/${serviceName}/traces?limit=50`);
            if (res.ok) {
                const data = await res.json();
                setTracesList(data);
                if (data.length > 0) {
                    // pre-select the most recent trace
                    const recentTraceId = data[0].traceId;
                    setTraceIdInput(recentTraceId);
                    fetchTrace(recentTraceId);
                } else {
                    setTraceIdInput('');
                    clearTrace();
                }
            } else {
                setTracesList([]);
                setTraceIdInput('');
                clearTrace();
            }
        } catch (e) {
            console.error('Failed to fetch traces list:', e);
            setTracesList([]);
        } finally {
            setIsFetchingTraces(false);
        }
    };

    const handleEdgeClick = async (source: string, target: string) => {
        try {
            const baseUrl = import.meta.env.VITE_API_URL || '';
            const ctxPath = import.meta.env.VITE_BACKEND_CONTEXT_PATH || '';
            // Fetch the trace ID that specifically spans this edge
            const res = await fetch(`${baseUrl}${ctxPath}/api/apm/edges/${source}/${target}/recent-trace`);
            if (res.ok) {
                const data = await res.json();
                if (data.traceId) {
                    setTraceIdInput(data.traceId);
                    fetchTrace(data.traceId);
                    // Scroll to the Trace Waterfall view
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            } else {
                console.warn('No recent traces found traversing this specific edge.');
            }
        } catch (e) {
            console.error('Failed to quick-fetch trace for edge:', e);
        }
    };

    return (
        <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full animate-fade-in relative z-10">
            {/* Background Effects (Matched to Dashboard and Logs) */}
            <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-br from-bg via-bg to-bg-surface"></div>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.05),transparent_50%)]"></div>
                <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
                <div className="absolute top-1/3 -right-20 w-80 h-80 bg-primary/3 rounded-full blur-3xl"></div>
                <div className="absolute bottom-20 left-1/4 w-72 h-72 bg-primary/4 rounded-full blur-3xl"></div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                        APM & Traces
                    </h1>
                    <p className="text-gray-400 mt-1">Monitor application performance and distributed traces</p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Time Range — Custom Portal Dropdown */}
                    <div className="relative">
                        <button
                            ref={timeRangeTriggerRef}
                            type="button"
                            onClick={() => {
                                if (!isTimeRangeOpen && timeRangeTriggerRef.current) {
                                    const r = timeRangeTriggerRef.current.getBoundingClientRect();
                                    setTimeRangeRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 180) });
                                }
                                setIsTimeRangeOpen(o => !o);
                            }}
                            className="bg-bg-elevated border border-gray-700 hover:border-primary/50 text-text text-sm rounded-lg flex items-center gap-2 px-3 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
                        >
                            <span>
                                {[
                                    { value: 15 * 60 * 1000,       label: 'Last 15 Minutes' },
                                    { value: 60 * 60 * 1000,       label: 'Last 1 Hour' },
                                    { value: 24 * 60 * 60 * 1000,  label: 'Last 24 Hours' },
                                ].find(o => o.value === timeRange)?.label ?? 'Last 1 Hour'}
                            </span>
                            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isTimeRangeOpen ? 'rotate-180' : ''}`} />
                        </button>
                    </div>

                    {isTimeRangeOpen && timeRangeRect && createPortal(
                        <div
                            ref={timeRangePanelRef}
                            style={{ position: 'fixed', top: timeRangeRect.top, left: timeRangeRect.left, width: timeRangeRect.width, zIndex: 9999 }}
                            className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-xl overflow-hidden"
                        >
                            {[
                                { value: 15 * 60 * 1000,       label: 'Last 15 Minutes' },
                                { value: 60 * 60 * 1000,       label: 'Last 1 Hour' },
                                { value: 24 * 60 * 60 * 1000,  label: 'Last 24 Hours' },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                        setTimeRange(opt.value);
                                        refresh(opt.value);
                                        if (activeView === 'map') fetchServiceMap(opt.value);
                                        setIsTimeRangeOpen(false);
                                    }}
                                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-primary/20 ${
                                        timeRange === opt.value ? 'text-primary font-medium' : 'text-gray-300'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>,
                        document.body
                    )}

                    <button
                        onClick={handleRefresh}
                        disabled={apmLoading || mapLoading}
                        className="px-4 py-2 bg-bg-elevated border border-gray-700 hover:border-blue-500 text-text rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                        <Activity className={`w-4 h-4 ${apmLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Trace & Service Search Bar */}
            <div className="bg-bg-surface border border-gray-800 rounded-xl p-2 mb-8 flex flex-col md:flex-row items-center gap-2 shadow-sm">
                <div className="relative flex-1 w-full">
                    <Server className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        value={serviceFilter}
                        onChange={(e) => setServiceFilter(e.target.value)}
                        placeholder="Search Service (e.g. auth-api)"
                        className="w-full bg-transparent border-none text-white focus:ring-0 pl-10 pr-4 py-2 placeholder-gray-500"
                    />
                    {serviceFilter && (
                        <button
                            onClick={() => setServiceFilter('')}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-white"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                <div className="hidden md:block w-px h-8 bg-gray-700 mx-2" />
                <div className="md:hidden h-px w-full bg-gray-700 my-1" />

                <div className="relative flex-1 w-full flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            value={traceIdInput}
                            onChange={(e) => setTraceIdInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && traceIdInput.trim() && fetchTrace(traceIdInput.trim())}
                            placeholder="Paste Trace ID (e.g. 1a2b3c...)"
                            className="w-full bg-transparent border-none text-white focus:ring-0 pl-10 pr-4 py-2 placeholder-gray-500"
                        />
                        {traceIdInput && (
                            <button
                                onClick={() => {
                                    setTraceIdInput('');
                                    clearTrace();
                                }}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    <button
                        onClick={() => traceIdInput.trim() && fetchTrace(traceIdInput.trim())}
                        disabled={traceLoading || !traceIdInput.trim()}
                        className="px-6 py-2 bg-primary hover:bg-primary/90 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap shadow-sm"
                    >
                        {traceLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Search Trace'}
                    </button>
                </div>
            </div>

            {selectedInspectorService ? (
                <div className="flex flex-col lg:flex-row gap-6 animate-fade-in">
                    {/* Left Panel: Service Cards List */}
                    <div className="w-full lg:w-1/3 xl:w-1/4 flex-shrink-0 flex flex-col gap-3 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-lg font-bold text-white">Services</h2>
                            <button onClick={() => {
                                setSelectedInspectorService(null);
                                setTraceIdInput('');
                                clearTrace();
                            }} className="text-sm text-primary hover:text-white transition-colors">
                                Back to Overview
                            </button>
                        </div>
                        {filteredMetrics.map((service) => (
                            <div
                                key={service.serviceName}
                                onClick={() => handleServiceClick(service.serviceName)}
                                className={`p-4 rounded-xl cursor-pointer transition-all border ${selectedInspectorService === service.serviceName ? 'bg-primary/10 border-primary shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'bg-bg-surface/40 border-gray-800 hover:border-gray-600'}`}
                            >
                                <h3 className="text-sm font-bold text-white flex justify-between">
                                    {service.serviceName}
                                    <span className={`text-xs ${service.errorRate > 5 ? 'text-red-400' : 'text-green-400'}`}>{service.errorRate.toFixed(1)}% err</span>
                                </h3>
                                <div className="flex justify-between text-xs text-gray-400 mt-2">
                                    <span>{service.rpm.toFixed(1)} RPM</span>
                                    <span>{service.p95DurationMs.toFixed(0)} ms (p95)</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Right Panel: Trace Dropdown & Waterfall */}
                    <div className="flex-1 flex flex-col gap-4">
                        <div className="bg-bg-surface border border-gray-800 rounded-xl p-4 shadow-sm flex flex-col gap-4">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Search className="w-5 h-5 text-primary" /> Trace Inspector ({selectedInspectorService})
                            </h2>
                            <div className="relative">
                                {isFetchingTraces ? (
                                    <div className="w-full bg-bg-elevated border border-gray-700 text-gray-400 text-sm rounded-lg p-3 flex items-center gap-3">
                                        <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                        Fetching recent traces...
                                    </div>
                                ) : (
                                    <select
                                        value={traceIdInput}
                                        onChange={(e) => {
                                            const newId = e.target.value;
                                            setTraceIdInput(newId);
                                            if (newId) fetchTrace(newId);
                                        }}
                                        className="w-full bg-bg-elevated border border-gray-700 text-white text-sm rounded-lg focus:ring-primary focus:border-primary block p-3 appearance-none cursor-pointer"
                                    >
                                        <option value="">-- Select a Trace to Inspect --</option>
                                        {tracesList.map(t => (
                                            <option key={t.traceId} value={t.traceId}>
                                                {new Date(t.startTimeUnixNano / 1000000).toLocaleTimeString()} | {t.name} | {t.durationMs.toFixed(2)}ms {t.statusCode === 2 ? '❌ Error' : '✅'}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>

                        {traceError ? (
                            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 text-red-400 flex items-center justify-between">
                                <div><span className="font-bold">Trace Error:</span> {traceError}</div>
                            </div>
                        ) : spans.length > 0 ? (
                            <div className="bg-bg-surface border border-gray-800 rounded-xl p-2 md:p-4 shadow-lg overflow-x-auto">
                                <TraceWaterfall spans={spans} />
                            </div>
                        ) : !isFetchingTraces && tracesList.length === 0 ? (
                            <div className="text-gray-400 text-center py-12 bg-bg-surface/50 rounded-xl border border-gray-800 border-dashed">
                                <Activity className="w-8 h-8 mx-auto mb-3 opacity-20" />
                                No APM traces available for this service in the selected time range.
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : (
                <>
                    {traceError && (
                        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 text-red-400 mb-8 flex items-center justify-between">
                            <div>
                                <span className="font-bold">Trace Error:</span> {traceError}
                            </div>
                            <button onClick={() => {
                                setTraceIdInput('');
                                clearTrace();
                            }} className="text-red-400 hover:text-red-300">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    )}

                    {spans.length > 0 && (
                        <div className="mb-12">
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Search className="w-5 h-5 text-primary" />
                                    Trace Inspection
                                </h2>
                                <button onClick={() => {
                                    setTraceIdInput('');
                                    clearTrace();
                                }} className="text-sm text-gray-400 hover:text-white transition-colors">
                                    Close Trace
                                </button>
                            </div>
                            <TraceWaterfall spans={spans} />
                        </div>
                    )}

                    <div className="mb-4 text-center">
                        <h2 className="text-xl font-bold text-white">Monitoring Overviews</h2>
                        <p className="text-sm text-gray-400">Aggregated performance across all instrumented nodes.</p>
                    </div>

                    {/* View Toggle Switch */}
                    <div className="flex bg-bg-surface/50 p-1 rounded-lg w-full max-w-sm mb-6 mx-auto border border-gray-800 shadow-inner">
                        <button
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${activeView === 'metrics' ? 'bg-primary text-white shadow-md border border-primary/50' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                            onClick={() => setActiveView('metrics')}
                        >
                            Metrics Grid
                        </button>
                        <button
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${activeView === 'map' ? 'bg-primary text-white shadow-md border border-primary/50' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                            onClick={() => setActiveView('map')}
                        >
                            Topology Map
                        </button>
                    </div>

                    {activeView === 'map' ? (
                        <div className="mb-8 animate-fade-in-up delay-100 relative">
                            {mapError ? (
                                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 text-red-400 mb-8">
                                    {mapError}
                                </div>
                            ) : (
                                <ServiceMap
                                    dependencies={dependencies}
                                    onNodeClick={(service) => setSelectedMapService(service)}
                                    onEdgeClick={handleEdgeClick}
                                    onPaneClick={() => setSelectedMapService(null)}
                                />
                            )}

                            {/* Sidebar Panel for Map Node Selection - Positioned absolute inside canvas */}
                            {selectedMapService && (() => {
                                const serviceData = metrics.find(m => m.serviceName === selectedMapService);
                                return (
                                    <div
                                        ref={sidebarRef}
                                        className="absolute right-6 top-1/2 -translate-y-1/2 w-full md:w-80 h-auto max-h-[550px] bg-black/40 backdrop-blur-2xl border border-gray-600/30 shadow-2xl rounded-2xl z-50 transform transition-all duration-300 flex flex-col overflow-hidden"
                                    >
                                        <div className="px-5 py-4 border-b border-gray-700/50 flex justify-between items-center bg-white/[0.03]">
                                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                                <Server className="w-4 h-4 text-blue-400" />
                                                {selectedMapService}
                                            </h3>
                                            <button
                                                onClick={() => setSelectedMapService(null)}
                                                className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>

                                        <div className="p-5 overflow-y-auto">
                                            {serviceData ? (
                                                <div className="space-y-5">
                                                    <div className="bg-black/30 border border-gray-700/50 rounded-xl p-4 shadow-inner">
                                                        <h4 className="text-xs font-semibold tracking-wider uppercase text-gray-400 mb-3 flex items-center gap-1.5">
                                                            <Activity className="w-3.5 h-3.5 text-blue-400" /> Key Metrics
                                                        </h4>
                                                        <div className="grid grid-cols-2 gap-y-4 gap-x-2">
                                                            <div>
                                                                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Throughput</p>
                                                                <p className="text-base font-mono text-white">{serviceData.rpm.toFixed(1)} <span className="text-[10px] text-gray-500 font-sans">RPM</span></p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">P95 Latency</p>
                                                                <p className="text-base font-mono text-white">{serviceData.p95DurationMs.toFixed(0)} <span className="text-[10px] text-gray-500 font-sans">ms</span></p>
                                                            </div>
                                                            <div className="col-span-2 pt-3 border-t border-gray-700/50 mt-1">
                                                                <div className="flex items-center justify-between">
                                                                    <p className="text-[10px] uppercase tracking-wider text-gray-500">Error Rate</p>
                                                                    <p className={`text-sm font-mono font-medium ${serviceData.errorRate > 5 ? 'text-red-400' : 'text-green-400'}`}>
                                                                        {serviceData.errorRate.toFixed(2)}%
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <button
                                                        onClick={() => {
                                                            setSelectedMapService(null);
                                                            handleServiceClick(selectedMapService);
                                                        }}
                                                        className="w-full py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-sm font-medium rounded-lg border border-blue-500/20 transition-colors flex items-center justify-center gap-2 group shadow-sm backdrop-blur-sm"
                                                    >
                                                        <Search className="w-4 h-4 group-hover:scale-110 transition-transform" /> Analyze Recent Trace
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="text-center py-10">
                                                    <Activity className="w-10 h-10 text-gray-600 mx-auto mb-4 animate-pulse" />
                                                    <p className="text-gray-400">Loading metrics...</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    ) : apmError ? (
                        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 text-red-400 mb-8">
                            {apmError}
                        </div>
                    ) : apmLoading ? (
                        <div className="flex justify-center flex-col items-center h-40 gap-4">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                            <p className="text-text-dim">Aggregating traces...</p>
                        </div>
                    ) : metrics.length === 0 ? (
                        <div className="bg-bg-card border border-gray-800 rounded-xl p-8 text-center mt-8 shadow-lg">
                            <Server className="w-12 h-12 text-primary mx-auto mb-4 opacity-50" />
                            <h3 className="text-xl font-medium text-white mb-2">No Service Data Found</h3>
                            <p className="text-gray-400 max-w-md mx-auto">
                                We couldn't find any APM telemetry data for the selected time range. Ensure your services are sending OTLP traces to kubiq.
                            </p>
                        </div>
                    ) : filteredMetrics.length === 0 ? (
                        <div className="bg-bg-card border border-gray-800 rounded-xl p-8 text-center mt-8 shadow-lg">
                            <Search className="w-12 h-12 text-gray-500 mx-auto mb-4 opacity-50" />
                            <h3 className="text-xl font-medium text-white mb-2">No Matching Services</h3>
                            <p className="text-gray-400 max-w-md mx-auto">
                                No services match your current filter "{serviceFilter}".
                            </p>
                            <button
                                onClick={() => setServiceFilter('')}
                                className="mt-4 text-primary hover:text-primary-hover font-medium underline"
                            >
                                Clear Filter
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                            {filteredMetrics.map((service) => (
                                <div
                                    key={service.serviceName}
                                    onClick={() => handleServiceClick(service.serviceName)}
                                    className="bg-bg-surface/40 backdrop-blur-md border border-gray-800 rounded-xl p-6 shadow-2xl hover:border-blue-500/50 hover:bg-white/5 cursor-pointer transition-all group relative overflow-hidden"
                                >
                                    <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="flex items-center gap-1 text-xs font-bold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded shadow-sm">
                                            <Search className="w-3.5 h-3.5" /> Analyze Trace
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-start mb-4">
                                        <h3 className="text-lg font-bold text-white flex items-center gap-2 group-hover:text-blue-400 transition-colors">
                                            {service.serviceName}
                                        </h3>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-gray-400 flex items-center gap-1.5">
                                                <Activity className="w-4 h-4 text-blue-400" /> Throughput (RPM)
                                            </span>
                                            <span className="font-mono text-white">{service.rpm.toFixed(1)}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-gray-400 flex items-center gap-1.5">
                                                <Clock className="w-4 h-4 text-yellow-400" /> P95 Latency
                                            </span>
                                            <span className="font-mono text-white">{service.p95DurationMs.toFixed(0)} ms</span>
                                        </div>
                                        <div className="flex justify-between items-center bg-bg-surface p-2 rounded -mx-2">
                                            <span className="text-sm text-gray-400 flex items-center gap-1.5">
                                                <AlertTriangle className={`w-4 h-4 ${service.errorRate > 5 ? 'text-red-500' : 'text-gray-500'}`} /> Error Rate
                                            </span>
                                            <span className={`font-mono font-medium ${service.errorRate > 5 ? 'text-red-400' : 'text-green-400'}`}>
                                                {service.errorRate.toFixed(2)}%
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

        </div>
    );
}
