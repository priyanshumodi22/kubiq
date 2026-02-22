import { useState } from 'react';
import { Activity, Clock, AlertTriangle, Search, Server, X } from 'lucide-react';
import { useApm } from '../hooks/useApm';
import { useTrace } from '../hooks/useTrace';
import TraceWaterfall from '../components/TraceWaterfall';

export default function ApmDashboard() {
    const { metrics, loading: apmLoading, error: apmError, refresh } = useApm();
    const { spans, loading: traceLoading, error: traceError, fetchTrace, clearTrace } = useTrace();

    const [timeRange, setTimeRange] = useState(60 * 60 * 1000); // Default 1H
    const [traceIdInput, setTraceIdInput] = useState('');

    const handleServiceClick = async (serviceName: string) => {
        try {
            const baseUrl = import.meta.env.VITE_API_URL || '';
            const ctxPath = import.meta.env.VITE_BACKEND_CONTEXT_PATH || '';
            const res = await fetch(`${baseUrl}${ctxPath}/api/apm/services/${serviceName}/recent-trace`);
            if (res.ok) {
                const data = await res.json();
                if (data.traceId) {
                    setTraceIdInput(data.traceId);
                    fetchTrace(data.traceId);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }
        } catch (e) {
            console.error('Failed to quick-fetch trace:', e);
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
                    <select
                        value={timeRange}
                        onChange={(e) => {
                            const newRange = parseInt(e.target.value);
                            setTimeRange(newRange);
                            refresh(newRange);
                        }}
                        className="bg-bg-elevated border border-gray-700 text-text text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5"
                    >
                        <option value={15 * 60 * 1000}>Last 15 Minutes</option>
                        <option value={60 * 60 * 1000}>Last 1 Hour</option>
                        <option value={24 * 60 * 60 * 1000}>Last 24 Hours</option>
                    </select>
                    <button
                        onClick={() => refresh(timeRange)}
                        disabled={apmLoading}
                        className="px-4 py-2 bg-bg-elevated border border-gray-700 hover:border-blue-500 text-text rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                        <Activity className={`w-4 h-4 ${apmLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Trace Search Bar */}
            <div className="bg-bg-surface border border-gray-800 rounded-xl p-4 mb-8 flex gap-3 shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        value={traceIdInput}
                        onChange={(e) => setTraceIdInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && fetchTrace(traceIdInput)}
                        placeholder="Paste Trace ID (e.g. 1a2b3c...)"
                        className="w-full bg-bg-elevated border border-gray-700 text-white rounded-lg pl-10 pr-4 py-2 focus:ring-primary focus:border-primary"
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
                    onClick={() => fetchTrace(traceIdInput)}
                    disabled={traceLoading || !traceIdInput.trim()}
                    className="px-6 py-2 bg-primary hover:bg-primary/90 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {traceLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Search Trace'}
                </button>
            </div>

            {traceError && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 text-red-400 mb-8 flex items-center justify-between">
                    <div>
                        <span className="font-bold">Trace Error:</span> {traceError}
                    </div>
                    <button onClick={clearTrace} className="text-red-400 hover:text-red-300">
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
                        <button onClick={clearTrace} className="text-sm text-gray-400 hover:text-white transition-colors">
                            Close Trace
                        </button>
                    </div>
                    <TraceWaterfall spans={spans} />
                </div>
            )}

            <div className="mb-4">
                <h2 className="text-xl font-bold text-white">Service Metrics</h2>
                <p className="text-sm text-gray-400">Aggregated performance across all instrumented nodes.</p>
            </div>

            {apmError ? (
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
                        We couldn't find any APM telemetry data for the selected time range. Ensure your services are sending OTLP traces to Kubiq.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                    {metrics.map((service) => (
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
        </div>
    );
}
