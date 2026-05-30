import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Clock, AlertTriangle, Search, Server, X, ChevronDown, CheckCircle2, Download } from 'lucide-react';
import { useApm } from '../hooks/useApm';
import { useTrace } from '../hooks/useTrace';
import { useServiceMap } from '../hooks/useServiceMap';
import TraceWaterfall from '../components/TraceWaterfall';
import ServiceMap from '../components/ServiceMap';
import { ApmConfigModal } from '../components/ApmConfigModal';
import { useAuth } from '../contexts/AuthContext';
import { Settings } from 'lucide-react';
import { TimeRangeSlider } from '../components/TimeRangeSlider';

export type TimeFilter = 
    | { type: 'relative', ms: number, label: string }
    | { type: 'absolute', fromMs: number, toMs: number, label: string };

const getPresets = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
    const prevWeekEnd = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const prevWeekStart = new Date(prevWeekEnd.getTime() - 6 * 24 * 60 * 60 * 1000);

    const formatShortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return [
        { label: 'Last minute', ms: 60 * 1000, type: 'relative' as const },
        { label: 'Last 5 minutes', ms: 5 * 60 * 1000, type: 'relative' as const },
        { label: 'Last 10 minutes', ms: 10 * 60 * 1000, type: 'relative' as const },
        { label: 'Last 30 minutes', ms: 30 * 60 * 1000, type: 'relative' as const },
        { label: 'Last hour', ms: 60 * 60 * 1000, type: 'relative' as const },
        { label: 'Last 6 hours', ms: 6 * 60 * 60 * 1000, type: 'relative' as const },
        { label: 'Last 12 hours', ms: 12 * 60 * 60 * 1000, type: 'relative' as const },
        { label: 'Last 24 hours', ms: 24 * 60 * 60 * 1000, type: 'relative' as const },
        { 
            label: 'Yesterday', 
            subLabel: formatShortDate(yesterday),
            type: 'absolute' as const, 
            fromMs: yesterday.getTime(), 
            toMs: yesterday.getTime() + 24 * 60 * 60 * 1000 - 1 
        },
        { 
            label: 'Two days ago', 
            subLabel: formatShortDate(twoDaysAgo),
            type: 'absolute' as const, 
            fromMs: twoDaysAgo.getTime(), 
            toMs: twoDaysAgo.getTime() + 24 * 60 * 60 * 1000 - 1 
        },
        { 
            label: 'Last seven days', 
            subLabel: `${formatShortDate(sevenDaysAgo)} - ${formatShortDate(today)}`,
            type: 'absolute' as const, 
            fromMs: sevenDaysAgo.getTime(), 
            toMs: now.getTime() 
        },
        { 
            label: 'Previous week', 
            subLabel: `${formatShortDate(prevWeekStart)} - ${formatShortDate(prevWeekEnd)}`,
            type: 'absolute' as const, 
            fromMs: prevWeekStart.getTime(), 
            toMs: prevWeekEnd.getTime() + 24 * 60 * 60 * 1000 - 1 
        },
    ];
};

export default function ApmDashboard() {
    const { hasRole } = useAuth();
    const isAdmin = hasRole('kubiq-admin');
    const [status, setStatus] = useState<{ supported: boolean; dbType: string; reason?: string; fix?: string } | null>(null);
    const [checkingStatus, setCheckingStatus] = useState(true);

    useEffect(() => {
        async function checkApmStatus() {
            try {
                const baseUrl = import.meta.env.VITE_API_URL || '';
                const ctxPath = import.meta.env.VITE_BACKEND_CONTEXT_PATH || '';
                const res = await fetch(`${baseUrl}${ctxPath}/api/apm/status`);
                if (res.ok) {
                    const data = await res.json();
                    setStatus(data);
                } else {
                    const data = await res.json().catch(() => ({}));
                    setStatus({
                        supported: false,
                        dbType: data.dbType || 'json',
                        reason: data.reason || 'APM is not supported with the current database adapter.',
                        fix: data.fix || 'Configure MySQL or MongoDB.'
                    });
                }
            } catch (e) {
                console.error('Failed to check APM status:', e);
                setStatus({ supported: true, dbType: 'unknown' });
            } finally {
                setCheckingStatus(false);
            }
        }
        checkApmStatus();
    }, []);

    const { metrics, loading: apmLoading, error: apmError, refresh } = useApm();
    const { spans, loading: traceLoading, error: traceError, fetchTrace, clearTrace } = useTrace();
    const { dependencies, loading: mapLoading, error: mapError, fetchServiceMap } = useServiceMap();

    const [timeFilter, setTimeFilter] = useState<TimeFilter>({ type: 'relative', ms: 60 * 60 * 1000, label: 'Last hour' });
    const [customFromDate, setCustomFromDate] = useState('');
    const [customFromTime, setCustomFromTime] = useState('');
    const [customToDate, setCustomToDate] = useState('');
    const [customToTime, setCustomToTime] = useState('');
    
    const [traceIdInput, setTraceIdInput] = useState('');
    const [isTraceDropdownOpen, setIsTraceDropdownOpen] = useState(false);
    const [serviceFilter, setServiceFilter] = useState('');
    const [activeView, setActiveView] = useState<'metrics' | 'map'>('metrics');
    const [selectedMapService, setSelectedMapService] = useState<string | null>(null);

    // Split Layout State
    const [selectedInspectorService, setSelectedInspectorService] = useState<string | null>(null);
    const [tracesList, setTracesList] = useState<any[]>([]);
    const [isFetchingTraces, setIsFetchingTraces] = useState(false);
    
    // Trace Filters
    const [minDurationFilter, setMinDurationFilter] = useState<number>(0);
    const [errorOnlyFilter, setErrorOnlyFilter] = useState<boolean>(false);
    const [routeSearch, setRouteSearch] = useState<string>('');
    
    // Config Modal
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

    // Export Modal
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);
    const [exportService, setExportService] = useState('');
    const [exportFromTime, setExportFromTime] = useState('');
    const [exportToTime, setExportToTime] = useState('');
    const [exportMinDuration, setExportMinDuration] = useState(0);
    const [exportErrorOnly, setExportErrorOnly] = useState(false);
    const [exportSpanSearch, setExportSpanSearch] = useState('');
    const [isExportServiceOpen, setIsExportServiceOpen] = useState(false);
    const [isExportDurationOpen, setIsExportDurationOpen] = useState(false);

    const sidebarRef = useRef<HTMLDivElement>(null);
    const timeRangeTriggerRef = useRef<HTMLButtonElement>(null);
    const timeRangePanelRef  = useRef<HTMLDivElement>(null);
    const [isTimeRangeOpen, setIsTimeRangeOpen] = useState(false);
    const [timeRangeRect, setTimeRangeRect] = useState<{ top: number; left: number; width: number } | null>(null);

    // Latency Dropdown State
    const latencyTriggerRef = useRef<HTMLButtonElement>(null);
    const latencyPanelRef = useRef<HTMLDivElement>(null);
    const [isLatencyOpen, setIsLatencyOpen] = useState(false);
    const [latencyRect, setLatencyRect] = useState<{ top: number; left: number; width: number } | null>(null);

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

    // Close dropdowns on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!timeRangeTriggerRef.current?.contains(t) && !timeRangePanelRef.current?.contains(t)) {
                setIsTimeRangeOpen(false);
            }
            if (!latencyTriggerRef.current?.contains(t) && !latencyPanelRef.current?.contains(t)) {
                setIsLatencyOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Fetch map data when switching to map view
    useEffect(() => {
        if (activeView === 'map') {
            const opts = timeFilter.type === 'relative' 
                ? { timeRangeMs: timeFilter.ms }
                : { fromMs: timeFilter.fromMs, toMs: timeFilter.toMs, timeRangeMs: timeFilter.toMs - timeFilter.fromMs };
            fetchServiceMap(opts);
        }
    }, [activeView, timeFilter, fetchServiceMap]);

    const handleRefresh = () => {
        const opts = timeFilter.type === 'relative' 
            ? { timeRangeMs: timeFilter.ms }
            : { fromMs: timeFilter.fromMs, toMs: timeFilter.toMs, timeRangeMs: timeFilter.toMs - timeFilter.fromMs };
        refresh(opts);
        if (activeView === 'map') {
            fetchServiceMap(opts);
        }
    };

    const handleServiceClick = async (serviceName: string) => {
        setSelectedInspectorService(serviceName);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        await fetchTracesWithFilters(serviceName, minDurationFilter, errorOnlyFilter, routeSearch, true);
    };

    const fetchTracesWithFilters = async (serviceName: string, minDur: number, errorOnly: boolean, search: string, autoSelectFirst: boolean = true) => {
        try {
            setIsFetchingTraces(true);
            const baseUrl = import.meta.env.VITE_API_URL || '';
            const ctxPath = import.meta.env.VITE_BACKEND_CONTEXT_PATH || '';
            
            const params = new URLSearchParams();
            if (minDur > 0) params.append('minDuration', minDur.toString());
            if (errorOnly) params.append('errorOnly', 'true');
            if (search.trim()) params.append('search', search.trim());
            
            // Apply global time filter to the trace list
            const now = Date.now();
            const from = timeFilter.type === 'relative' ? now - timeFilter.ms : timeFilter.fromMs;
            const to = timeFilter.type === 'relative' ? now : timeFilter.toMs;
            params.append('fromMs', from.toString());
            params.append('toMs', to.toString());

            const res = await fetch(`${baseUrl}${ctxPath}/api/apm/services/${serviceName}/traces?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setTracesList(data);
                if (data.length > 0 && autoSelectFirst) {
                    const recentTraceId = data[0].traceId;
                    setTraceIdInput(recentTraceId);
                    fetchTrace(recentTraceId);
                } else if (data.length === 0 && autoSelectFirst) {
                    clearTrace();
                    setTraceIdInput('');
                } else if (!autoSelectFirst) {
                    // Check if the currently viewed trace still matches the new filters
                    const stillExists = data.some((t: any) => t.traceId === traceIdInput);
                    if (!stillExists) {
                        clearTrace();
                        setTraceIdInput('');
                    }
                }
            } else {
                setTracesList([]);
                if (autoSelectFirst) {
                    setTraceIdInput('');
                    clearTrace();
                }
            }
        } catch (e) {
            console.error('Failed to fetch traces list:', e);
            setTracesList([]);
        } finally {
            setIsFetchingTraces(false);
        }
    };

    // Re-fetch traces when filters change
    useEffect(() => {
        if (selectedInspectorService) {
            fetchTracesWithFilters(selectedInspectorService, minDurationFilter, errorOnlyFilter, routeSearch, false);
        }
    }, [minDurationFilter, errorOnlyFilter, routeSearch, timeFilter]);

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

    const selectedTraceObj = tracesList.find(t => t.traceId === traceIdInput);

    const applyCustomTime = () => {
        if (!customFromDate || !customFromTime || !customToDate || !customToTime) return;
        
        const from = new Date(`${customFromDate}T${customFromTime}`).getTime();
        const to = new Date(`${customToDate}T${customToTime}`).getTime();
        
        const now = Date.now();
        if (from > now || to > now) {
            alert('Cannot select a time in the future.');
            return;
        }
        
        if (from >= to) {
            alert('Start time must be before end time.');
            return;
        }
        
        const newFilter: TimeFilter = { type: 'absolute', fromMs: from, toMs: to, label: `${customFromDate} ${customFromTime} to ${customToDate} ${customToTime}` };
        setTimeFilter(newFilter);
        
        const opts = { fromMs: from, toMs: to, timeRangeMs: to - from };
        refresh(opts);
        if (activeView === 'map') fetchServiceMap(opts);
        setIsTimeRangeOpen(false);
    };

    // Initialize custom dates when opening the dropdown based on current timeFilter
    useEffect(() => {
        if (isTimeRangeOpen) {
            const pad = (n: number) => String(n).padStart(2, '0');
            const now = Date.now();
            const from = timeFilter.type === 'relative' ? now - timeFilter.ms : timeFilter.fromMs;
            const to = timeFilter.type === 'relative' ? now : timeFilter.toMs;
            
            const fromDate = new Date(from);
            setCustomFromDate(`${fromDate.getFullYear()}-${pad(fromDate.getMonth()+1)}-${pad(fromDate.getDate())}`);
            setCustomFromTime(`${pad(fromDate.getHours())}:${pad(fromDate.getMinutes())}`);
            
            const toDate = new Date(to);
            setCustomToDate(`${toDate.getFullYear()}-${pad(toDate.getMonth()+1)}-${pad(toDate.getDate())}`);
            setCustomToTime(`${pad(toDate.getHours())}:${pad(toDate.getMinutes())}`);
        }
    }, [isTimeRangeOpen, timeFilter]);

    const handleSliderChange = (val: [number, number]) => {
        const pad = (n: number) => String(n).padStart(2, '0');
        const fromDate = new Date(val[0]);
        setCustomFromDate(`${fromDate.getFullYear()}-${pad(fromDate.getMonth()+1)}-${pad(fromDate.getDate())}`);
        setCustomFromTime(`${pad(fromDate.getHours())}:${pad(fromDate.getMinutes())}`);
        
        const toDate = new Date(val[1]);
        setCustomToDate(`${toDate.getFullYear()}-${pad(toDate.getMonth()+1)}-${pad(toDate.getDate())}`);
        setCustomToTime(`${pad(toDate.getHours())}:${pad(toDate.getMinutes())}`);
    };

    const sliderMaxMs = Date.now();
    const sliderMinMs = sliderMaxMs - 7 * 24 * 60 * 60 * 1000;
    
    let sliderFromMs = sliderMaxMs - 60 * 60 * 1000;
    if (customFromDate && customFromTime) {
        sliderFromMs = new Date(`${customFromDate}T${customFromTime}`).getTime();
    }
    
    let sliderToMs = sliderMaxMs;
    if (customToDate && customToTime) {
        sliderToMs = new Date(`${customToDate}T${customToTime}`).getTime();
    }
    
    // Clamp to slider bounds
    sliderFromMs = Math.max(sliderMinMs, Math.min(sliderFromMs, sliderMaxMs));
    sliderToMs = Math.max(sliderMinMs, Math.min(sliderToMs, sliderMaxMs));

    const todayObj = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayString = `${todayObj.getFullYear()}-${pad(todayObj.getMonth()+1)}-${pad(todayObj.getDate())}`;

    if (checkingStatus) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] relative z-10 animate-fade-in">
                {/* Background Effects */}
                <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-br from-bg via-bg to-bg-surface"></div>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.05),transparent_50%)]"></div>
                </div>
                <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                        <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin"></div>
                        <Activity className="w-6 h-6 text-primary absolute inset-0 m-auto animate-pulse" />
                    </div>
                    <p className="text-text-dim text-sm animate-pulse">Analyzing system configuration...</p>
                </div>
            </div>
        );
    }

    if (status && !status.supported) {
        return (
            <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto w-full animate-fade-in relative z-10">
                {/* Background Effects */}
                <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-br from-bg via-bg to-bg-surface"></div>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(239,68,68,0.08),transparent_60%)]"></div>
                    <div className="absolute -top-40 -left-40 w-96 h-96 bg-error/5 rounded-full blur-3xl"></div>
                    <div className="absolute bottom-20 right-20 w-80 h-80 bg-primary/3 rounded-full blur-3xl"></div>
                </div>

                <div className="mt-8 mb-6 text-center sm:text-left">
                    <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-400">
                        APM & Distributed Traces
                    </h1>
                    <p className="text-text-dim mt-1">Application performance monitoring and diagnostics</p>
                </div>

                {/* Glassmorphic main alert box */}
                <div className="bg-bg-surface/60 backdrop-blur-xl border border-error/20 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
                    {/* Top edge glowing stripe */}
                    <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-error/50 to-transparent"></div>

                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
                        <div className="p-4 rounded-xl bg-error/10 border border-error/20 text-error animate-pulse-slow">
                            <AlertTriangle className="w-8 h-8" />
                        </div>
                        
                        <div className="flex-1 text-center sm:text-left">
                            <h2 className="text-xl font-semibold text-white mb-2">APM is Disabled (json mode)</h2>
                            <p className="text-text-dim text-sm sm:text-base leading-relaxed mb-6">
                                Kubiq is currently configured with <code className="px-1.5 py-0.5 rounded bg-bg-elevated border border-gray-700 text-error font-mono text-xs font-bold font-semibold">DB_TYPE=json</code>. 
                                APM, distributed trace collection, metrics, and service maps require a persistent database backend with advanced indexing capabilities.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                <div className="p-4 rounded-xl bg-bg-elevated/40 border border-gray-800 text-left">
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Why this database?</h3>
                                    <p className="text-xs text-text-dim leading-normal">
                                        The JSON adapter saves data directly to flat files. Ingesting and querying thousands of spans would quickly overwhelm disk storage and block the main Node.js event loop.
                                    </p>
                                </div>
                                <div className="p-4 rounded-xl bg-bg-elevated/40 border border-gray-800 text-left">
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Supported Engines</h3>
                                    <p className="text-xs text-text-dim leading-normal">
                                        APM is fully integrated with <span className="text-white font-medium">MySQL (or MariaDB)</span> and <span className="text-white font-medium">MongoDB</span>. They provide indexing for traceId/service searches and aggregate metrics fast.
                                    </p>
                                </div>
                            </div>

                            <div className="border-t border-gray-800/80 pt-6">
                                <h3 className="text-sm font-semibold text-white mb-3 text-left">How to Enable APM</h3>
                                <p className="text-xs text-text-dim text-left mb-3">
                                    Edit your environment configuration <code className="px-1 py-0.5 rounded bg-bg-elevated text-white font-mono text-xs">.env</code> in the backend root directory, set <code className="text-primary font-mono font-semibold">DB_TYPE</code>, and restart your Kubiq backend process.
                                </p>

                                <div className="bg-black/40 border border-gray-800 rounded-lg p-4 font-mono text-xs text-left relative overflow-hidden select-all group">
                                    <div className="absolute top-2 right-2 text-[10px] text-gray-500 font-sans group-hover:text-primary transition-colors">
                                        Click to select all
                                    </div>
                                    <div className="text-gray-500"># e:\kubiq-product\kubiq\backend\.env</div>
                                    <div className="text-gray-400 mt-1 font-sans"># Change from DB_TYPE=json to one of:</div>
                                    <div><span className="text-primary">DB_TYPE</span>=mysql</div>
                                    <div className="text-gray-500 mt-1"># Or:</div>
                                    <div><span className="text-primary">DB_TYPE</span>=mongodb</div>
                                    <div className="text-gray-400 mt-2 font-sans"># If using MySQL, configure connection settings:</div>
                                    <div><span className="text-primary">MYSQL_HOST</span>=localhost</div>
                                    <div><span className="text-primary">MYSQL_USER</span>=root</div>
                                    <div><span className="text-primary">MYSQL_PASSWORD</span>=yourpassword</div>
                                    <div><span className="text-primary">MYSQL_DATABASE</span>=kubiq</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Additional assistance cards */}
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                    <div className="p-5 bg-bg-surface/40 border border-gray-800 hover:border-gray-700 rounded-xl transition-all">
                        <h4 className="text-sm font-medium text-white mb-1">Live Logs are Available</h4>
                        <p className="text-xs text-text-dim leading-relaxed">
                            You can still view real-time log streams and container tailing. Logs do not require trace database adapters.
                        </p>
                    </div>
                    <div className="p-5 bg-bg-surface/40 border border-gray-800 hover:border-gray-700 rounded-xl transition-all">
                        <h4 className="text-sm font-medium text-white mb-1">Local Testing Tip</h4>
                        <p className="text-xs text-text-dim leading-relaxed">
                            For quick testing, spin up a lightweight MySQL or MongoDB container using Docker, update your configuration, and restart Kubiq.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

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

                <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto mt-4 sm:mt-0">
                    {/* Time Range — Custom Portal Dropdown */}
                    <div className="relative">
                        <button
                            ref={timeRangeTriggerRef}
                            type="button"
                            onClick={() => {
                                if (!isTimeRangeOpen && timeRangeTriggerRef.current) {
                                    const r = timeRangeTriggerRef.current.getBoundingClientRect();
                                    const isMobile = window.innerWidth < 640;
                                    if (isMobile) {
                                        setTimeRangeRect({ top: r.bottom + 4, left: 16, width: window.innerWidth - 32 });
                                    } else {
                                        setTimeRangeRect({ top: r.bottom + 4, left: r.right - 580 > 0 ? r.right - 580 : Math.max(16, r.left), width: 580 });
                                    }
                                }
                                setIsTimeRangeOpen(o => !o);
                            }}
                            className="bg-bg-elevated border border-gray-700 hover:border-primary/50 text-text text-sm rounded-lg flex items-center justify-between gap-2 px-3 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-[180px]"
                        >
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-primary shrink-0" />
                                {timeFilter.type === 'absolute' && timeFilter.label.includes(' to ') && timeFilter.label.split(' ').length === 5 ? (
                                    <div className="flex flex-col items-start text-left min-w-[150px]">
                                        <span className="text-[10px] text-gray-400 leading-tight">
                                            {timeFilter.label.split(' ')[0]} to {timeFilter.label.split(' ')[3]}
                                        </span>
                                        <span className="text-sm leading-tight text-white">
                                            {timeFilter.label.split(' ')[1]} to {timeFilter.label.split(' ')[4]}
                                        </span>
                                    </div>
                                ) : (
                                    <span className="truncate max-w-[200px]">
                                        {timeFilter.label}
                                    </span>
                                )}
                            </div>
                            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isTimeRangeOpen ? 'rotate-180' : ''}`} />
                        </button>
                    </div>

                    {isTimeRangeOpen && timeRangeRect && createPortal(
                        <div
                            ref={timeRangePanelRef}
                            style={{ 
                                position: 'fixed', 
                                top: timeRangeRect.top, 
                                left: window.innerWidth < 640 ? '16px' : timeRangeRect.left, 
                                right: window.innerWidth < 640 ? '16px' : 'auto',
                                width: window.innerWidth < 640 ? 'auto' : timeRangeRect.width, 
                                zIndex: 9999 
                            }}
                            className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col"
                        >
                            {/* Header */}
                            <div className="flex border-b border-white/10 bg-black/20">
                                <div className="py-2 sm:py-3 px-4 sm:px-6 text-sm font-medium text-primary border-b-2 border-primary flex items-center gap-2">
                                    <Clock className="w-4 h-4" /> Time range
                                </div>
                            </div>

                            <div className="p-3 sm:p-4 flex flex-col gap-3 sm:gap-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
                                {/* Presets Section */}
                                <div>
                                    <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-2 sm:mb-3">Presets</h3>
                                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                        {getPresets().map(preset => {
                                            const isActive = preset.type === 'relative' 
                                                ? timeFilter.type === 'relative' && timeFilter.ms === preset.ms
                                                : timeFilter.type === 'absolute' && timeFilter.fromMs === preset.fromMs && timeFilter.toMs === preset.toMs;
                                            
                                            const hideOnMobile = ['Last 12 hours', 'Last 24 hours', 'Yesterday', 'Two days ago', 'Last seven days', 'Previous week'].includes(preset.label);

                                            return (
                                                <button
                                                    key={preset.label}
                                                    type="button"
                                                    onClick={() => {
                                                        const newFilter: TimeFilter = preset.type === 'relative' 
                                                            ? { type: 'relative', ms: preset.ms, label: preset.label }
                                                            : { type: 'absolute', fromMs: preset.fromMs, toMs: preset.toMs, label: preset.label };
                                                            
                                                        setTimeFilter(newFilter);
                                                        const opts = preset.type === 'relative' 
                                                            ? { timeRangeMs: preset.ms }
                                                            : { fromMs: preset.fromMs, toMs: preset.toMs, timeRangeMs: preset.toMs - preset.fromMs };
                                                            
                                                        refresh(opts);
                                                        if (activeView === 'map') fetchServiceMap(opts);
                                                        setIsTimeRangeOpen(false);
                                                    }}
                                                    className={`px-2 py-1.5 sm:py-3 text-xs border rounded-md transition-all text-left flex-col justify-center h-full min-h-[36px] sm:min-h-[50px] ${hideOnMobile ? 'hidden sm:flex' : 'flex'} ${
                                                        isActive 
                                                            ? 'border-primary bg-primary/10 text-white font-medium shadow-sm' 
                                                            : 'border-gray-700 bg-bg-elevated text-gray-300 hover:border-gray-500 hover:bg-gray-800'
                                                    }`}
                                                >
                                                    {preset.subLabel && <span className="text-[10px] opacity-70 mb-0.5 font-normal truncate w-full">{preset.subLabel}</span>}
                                                    <span className="truncate w-full">{preset.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Custom Time Range Section */}
                                <div>
                                    <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-2 sm:mb-3">Custom Range</h3>
                                    
                                    <div className="mb-2 sm:mb-4">
                                        <TimeRangeSlider 
                                            minMs={sliderMinMs} 
                                            maxMs={sliderMaxMs} 
                                            value={[sliderFromMs, sliderToMs]} 
                                            onChange={handleSliderChange} 
                                        />
                                    </div>

                                    {/* Inputs */}
                                    <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 bg-black/20 p-2 sm:p-3 rounded-lg border border-gray-800">
                                        <div className="flex gap-2 flex-1 w-full">
                                            <input 
                                                type="date" 
                                                max={todayString}
                                                className="bg-bg-elevated border border-gray-700 rounded text-sm px-2 py-1 sm:py-1.5 text-white focus:border-primary outline-none w-full"
                                                value={customFromDate}
                                                onChange={e => setCustomFromDate(e.target.value)}
                                            />
                                            <input 
                                                type="time" 
                                                className="bg-bg-elevated border border-gray-700 rounded text-sm px-2 py-1 sm:py-1.5 text-white focus:border-primary outline-none"
                                                value={customFromTime}
                                                onChange={e => setCustomFromTime(e.target.value)}
                                            />
                                        </div>
                                        <div className="text-gray-500 text-sm font-medium px-1">to</div>
                                        <div className="flex gap-2 flex-1 w-full">
                                            <input 
                                                type="date" 
                                                max={todayString}
                                                className="bg-bg-elevated border border-gray-700 rounded text-sm px-2 py-1 sm:py-1.5 text-white focus:border-primary outline-none w-full"
                                                value={customToDate}
                                                onChange={e => setCustomToDate(e.target.value)}
                                            />
                                            <input 
                                                type="time" 
                                                className="bg-bg-elevated border border-gray-700 rounded text-sm px-2 py-1 sm:py-1.5 text-white focus:border-primary outline-none"
                                                value={customToTime}
                                                onChange={e => setCustomToTime(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <div className="mt-2 sm:mt-4 flex justify-end">
                                        <button
                                            onClick={applyCustomTime}
                                            disabled={!customFromDate || !customFromTime || !customToDate || !customToTime}
                                            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                        >
                                            Set time
                                        </button>
                                    </div>
                                </div>
                            </div>
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

                    <button
                        onClick={() => {
                            setExportError(null);
                            const now = new Date();
                            const from = timeFilter.type === 'relative' ? new Date(now.getTime() - timeFilter.ms) : new Date(timeFilter.fromMs);
                            const toDateExp = timeFilter.type === 'relative' ? now : new Date(timeFilter.toMs);
                            const pad = (n: number) => String(n).padStart(2, '0');
                            const to12hTimeStr = (d: Date) => {
                                let h = d.getHours();
                                const m = pad(d.getMinutes());
                                const s = pad(d.getSeconds());
                                const ampm = h >= 12 ? 'PM' : 'AM';
                                h = h % 12;
                                h = h ? h : 12;
                                return `${pad(h)}:${m}:${s} ${ampm}`;
                            };
                            setExportFromTime(to12hTimeStr(from));
                            setExportToTime(to12hTimeStr(toDateExp));
                            setExportService(selectedInspectorService || '');
                            setIsExportModalOpen(true);
                        }}
                        className="px-4 py-2 bg-bg-elevated border border-gray-700 hover:border-green-500/70 text-text rounded-lg flex items-center gap-2 transition-colors"
                        title="Export Slow Queries as CSV"
                    >
                        <Download className="w-4 h-4 text-green-400" />
                        Export
                    </button>

                    {isAdmin && (
                        <button
                            onClick={() => setIsConfigModalOpen(true)}
                            className="bg-bg-elevated border border-gray-700 hover:border-primary/50 text-text rounded-lg flex items-center justify-center transition-colors w-[42px] h-[42px]"
                            title="APM Configuration"
                        >
                            <Settings className="w-5 h-5 text-gray-400" />
                        </button>
                    )}
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

                <div className="relative flex-1 w-full flex flex-col sm:flex-row gap-2">
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
                            <h2 className="text-xl font-bold text-white flex items-start sm:items-center gap-2 mb-2">
                                <Search className="w-5 h-5 text-primary shrink-0 mt-1 sm:mt-0" /> 
                                <span className="break-words">Trace Inspector ({selectedInspectorService})</span>
                            </h2>
                            
                            {/* Filter Bar */}
                            <div className="flex flex-wrap gap-2 mb-2 bg-black/20 p-2 rounded-lg border border-gray-800/50">
                                {/* Custom Latency Dropdown */}
                                <div className="relative">
                                    <button
                                        ref={latencyTriggerRef}
                                        type="button"
                                        onClick={() => {
                                            if (!isLatencyOpen && latencyTriggerRef.current) {
                                                const r = latencyTriggerRef.current.getBoundingClientRect();
                                                setLatencyRect({ top: r.bottom + 4, left: r.left, width: r.width });
                                            }
                                            setIsLatencyOpen(o => !o);
                                        }}
                                        className="bg-bg-elevated border border-gray-700 hover:border-primary/50 text-gray-300 text-sm rounded-lg flex items-center justify-between gap-2 px-3 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-[130px]"
                                    >
                                        <span>
                                            {[
                                                { value: 0,    label: 'Any Latency' },
                                                { value: 100,  label: '> 100ms' },
                                                { value: 500,  label: '> 500ms' },
                                                { value: 2000, label: '> 2s' },
                                            ].find(o => o.value === minDurationFilter)?.label ?? 'Any Latency'}
                                        </span>
                                        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${isLatencyOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isLatencyOpen && latencyRect && createPortal(
                                        <div
                                            ref={latencyPanelRef}
                                            style={{ position: 'fixed', top: latencyRect.top, left: latencyRect.left, width: latencyRect.width, zIndex: 9999 }}
                                            className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-xl overflow-hidden"
                                        >
                                            {[
                                                { value: 0,    label: 'Any Latency' },
                                                { value: 100,  label: '> 100ms' },
                                                { value: 500,  label: '> 500ms' },
                                                { value: 2000, label: '> 2s' },
                                            ].map(opt => (
                                                <button
                                                    key={opt.value}
                                                    data-latency-value={opt.value}
                                                    type="button"
                                                    onClick={() => {
                                                        setMinDurationFilter(opt.value);
                                                        setIsLatencyOpen(false);
                                                    }}
                                                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-primary/20 ${
                                                        minDurationFilter === opt.value ? 'text-primary font-medium' : 'text-gray-300'
                                                    }`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>,
                                        document.body
                                    )}
                                </div>

                                <button
                                    onClick={() => setErrorOnlyFilter(!errorOnlyFilter)}
                                    className={`px-3 py-2 text-sm rounded-lg border transition-colors flex items-center gap-2 ${errorOnlyFilter ? 'bg-red-500/20 border-red-500/50 text-red-400 font-medium' : 'bg-bg-elevated border-gray-700 text-gray-400 hover:text-gray-300 hover:border-gray-600'}`}
                                >
                                    {errorOnlyFilter ? <AlertTriangle className="w-4 h-4" /> : null}
                                    Errors Only
                                </button>

                                <div className="flex-1 min-w-[200px] relative">
                                    <input
                                        type="text"
                                        value={routeSearch}
                                        onChange={(e) => setRouteSearch(e.target.value)}
                                        placeholder="Filter by attribute (e.g. /checkout)..."
                                        className="w-full bg-bg-elevated border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:border-primary outline-none placeholder:text-gray-500 transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="relative">
                                {isFetchingTraces ? (
                                    <div className="w-full bg-bg-elevated border border-gray-700 text-gray-400 text-sm rounded-lg p-3 flex items-center gap-3">
                                        <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                        Fetching recent traces...
                                    </div>
                                ) : (
                                    <div className="relative w-full">
                                        <div 
                                            onClick={() => setIsTraceDropdownOpen(!isTraceDropdownOpen)}
                                            className="bg-[#1f2937] p-3 rounded-lg border border-gray-700 flex justify-between items-center group overflow-hidden gap-2 cursor-pointer hover:border-gray-500 transition-colors"
                                        >
                                            <div className="flex items-center gap-3 overflow-x-auto custom-scrollbar pb-1 sm:pb-0 hide-scrollbar-sm w-full">
                                                {selectedTraceObj ? (
                                                    <>
                                                        <Activity className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${selectedTraceObj.statusCode === 2 ? 'text-red-500' : 'text-green-500'}`} />
                                                        <span className="text-xs sm:text-sm text-gray-300 font-mono whitespace-nowrap">
                                                            {new Date(selectedTraceObj.startTimeUnixNano / 1000000).toLocaleTimeString()} | {selectedTraceObj.name} | {selectedTraceObj.durationMs.toFixed(2)}ms 
                                                            {selectedTraceObj.statusCode === 2 ? (
                                                                <span className="text-red-500 inline-flex items-center ml-1 align-text-bottom gap-1"><X className="w-3.5 h-3.5" /> Error</span>
                                                            ) : (
                                                                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 inline ml-1 align-text-bottom" />
                                                            )}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span className="text-gray-400 text-sm">-- Select a Trace to Inspect --</span>
                                                )}
                                            </div>
                                            <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isTraceDropdownOpen ? 'rotate-180' : ''}`} />
                                        </div>

                                        {isTraceDropdownOpen && (
                                            <div className="absolute top-full left-0 right-0 mt-2 bg-[#111827] border border-gray-700 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto custom-scrollbar">
                                                {tracesList.length > 0 ? (
                                                    <div className="p-1">
                                                        {tracesList.map(t => (
                                                            <div
                                                                key={t.traceId}
                                                                data-trace-id={t.traceId}
                                                                onClick={() => {
                                                                    setTraceIdInput(t.traceId);
                                                                    fetchTrace(t.traceId);
                                                                    setIsTraceDropdownOpen(false);
                                                                }}
                                                                className={`trace-option flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
                                                                    selectedTraceObj?.traceId === t.traceId 
                                                                        ? 'bg-[#3b82f6]/20 border border-[#3b82f6]/50 text-white' 
                                                                        : 'hover:bg-[#1f2937] text-gray-300 hover:text-white border border-transparent'
                                                                }`}
                                                            >
                                                                <Activity className={`w-3.5 h-3.5 shrink-0 ${t.statusCode === 2 ? 'text-red-500' : 'text-green-500'}`} />
                                                                <span className="text-xs font-mono whitespace-nowrap">
                                                                    {new Date(t.startTimeUnixNano / 1000000).toLocaleTimeString()} | {t.name} | {t.durationMs.toFixed(2)}ms 
                                                                    {t.statusCode === 2 ? (
                                                                        <span className="text-red-500 inline-flex items-center ml-1 align-text-bottom gap-1"><X className="w-3.5 h-3.5" /> Error</span>
                                                                    ) : (
                                                                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 inline ml-1 align-text-bottom" />
                                                                    )}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="p-4 text-center text-gray-500 text-sm">
                                                        No traces found matching filters.
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
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

            <ApmConfigModal
                isOpen={isConfigModalOpen}
                onClose={() => setIsConfigModalOpen(false)}
            />

            {/* Export Slow Queries Modal */}
            {isExportModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity duration-300" onClick={() => setIsExportModalOpen(false)} />
                    <div className="relative bg-[#0B0C10] bg-gradient-to-b from-[#13151A] to-[#0B0C10] border border-gray-700/60 rounded-2xl shadow-2xl shadow-green-900/10 w-full max-w-lg animate-fade-in ring-1 ring-white/5">
                        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800/80 bg-white/[0.02] rounded-t-2xl">
                            <div className="flex items-center gap-4">
                                <div className="p-2.5 bg-green-500/10 rounded-xl border border-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.1)]">
                                    <Download className="w-5 h-5 text-green-400" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-white tracking-wide">Export Slow Queries</h2>
                                    <p className="text-[11px] text-gray-400 font-medium">All filters optional — AND-ed together</p>
                                </div>
                            </div>
                            <button onClick={() => setIsExportModalOpen(false)} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all hover:rotate-90 duration-300">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="px-6 py-6 space-y-6">
                            <div>
                                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-blue-400" /> Time Range
                                    <span className="text-gray-600 font-normal normal-case tracking-normal ml-1">— today, IST</span>
                                </label>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-[10px] text-gray-500 mb-1.5 ml-1">From (e.g. 11:03:55 PM)</p>
                                        <input type="text" value={exportFromTime} onChange={e => setExportFromTime(e.target.value)}
                                            placeholder="11:03:55 PM"
                                            className="w-full bg-[#1A1C23] border border-gray-700/60 text-white text-sm rounded-xl px-4 py-2.5 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 outline-none placeholder:text-gray-600 transition-all shadow-inner" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-gray-500 mb-1.5 ml-1">To (e.g. 11:08:30 PM)</p>
                                        <input type="text" value={exportToTime} onChange={e => setExportToTime(e.target.value)}
                                            placeholder="11:08:30 PM"
                                            className="w-full bg-[#1A1C23] border border-gray-700/60 text-white text-sm rounded-xl px-4 py-2.5 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 outline-none placeholder:text-gray-600 transition-all shadow-inner" />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="relative">
                                    <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                                        <Server className="w-3.5 h-3.5 text-purple-400" /> Service
                                    </label>
                                    <button 
                                        type="button"
                                        onClick={() => { setIsExportServiceOpen(!isExportServiceOpen); setIsExportDurationOpen(false); }}
                                        className="w-full bg-[#1A1C23] border border-gray-700/60 hover:border-purple-500/50 text-white text-sm rounded-xl px-4 py-2.5 transition-all flex items-center justify-between shadow-inner focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                    >
                                        <span className="truncate">{exportService || 'All Services'}</span>
                                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${isExportServiceOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    
                                    {isExportServiceOpen && (
                                        <div className="absolute z-20 w-full mt-2 bg-[#1A1C23] border border-gray-700/80 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.6)] max-h-52 overflow-y-auto overflow-hidden animate-fade-in ring-1 ring-white/5 py-1 custom-scrollbar">
                                            <button 
                                                type="button"
                                                onClick={() => { setExportService(''); setIsExportServiceOpen(false); }}
                                                className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-purple-500/15 ${exportService === '' ? 'text-purple-400 font-medium bg-purple-500/5' : 'text-gray-300'}`}
                                            >
                                                All Services
                                            </button>
                                            {metrics.map(m => (
                                                <button 
                                                    type="button"
                                                    key={m.serviceName}
                                                    onClick={() => { setExportService(m.serviceName); setIsExportServiceOpen(false); }}
                                                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-purple-500/15 ${exportService === m.serviceName ? 'text-purple-400 font-medium bg-purple-500/5' : 'text-gray-300'}`}
                                                >
                                                    {m.serviceName}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="relative">
                                    <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                                        <Activity className="w-3.5 h-3.5 text-orange-400" /> Min Duration
                                    </label>
                                    <button 
                                        type="button"
                                        onClick={() => { setIsExportDurationOpen(!isExportDurationOpen); setIsExportServiceOpen(false); }}
                                        className="w-full bg-[#1A1C23] border border-gray-700/60 hover:border-orange-500/50 text-white text-sm rounded-xl px-4 py-2.5 transition-all flex items-center justify-between shadow-inner focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                    >
                                        <span>
                                            {exportMinDuration === 0 ? 'Any Duration' : 
                                             exportMinDuration === 100 ? '> 100ms' : 
                                             exportMinDuration === 500 ? '> 500ms' : 
                                             exportMinDuration === 1000 ? '> 1s' : 
                                             exportMinDuration === 2000 ? '> 2s' : '> 5s'}
                                        </span>
                                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${isExportDurationOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isExportDurationOpen && (
                                        <div className="absolute z-20 w-full mt-2 bg-[#1A1C23] border border-gray-700/80 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.6)] overflow-hidden animate-fade-in ring-1 ring-white/5 py-1">
                                            {[
                                                { v: 0, l: 'Any Duration' },
                                                { v: 100, l: '> 100ms' },
                                                { v: 500, l: '> 500ms' },
                                                { v: 1000, l: '> 1s' },
                                                { v: 2000, l: '> 2s' },
                                                { v: 5000, l: '> 5s' }
                                            ].map(opt => (
                                                <button 
                                                    type="button"
                                                    key={opt.v}
                                                    onClick={() => { setExportMinDuration(opt.v); setIsExportDurationOpen(false); }}
                                                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-orange-500/15 ${exportMinDuration === opt.v ? 'text-orange-400 font-medium bg-orange-500/5' : 'text-gray-300'}`}
                                                >
                                                    {opt.l}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                                    <Search className="w-3.5 h-3.5 text-cyan-400" /> Span Name Filter
                                </label>
                                <input type="text" value={exportSpanSearch} onChange={e => setExportSpanSearch(e.target.value)}
                                    placeholder="e.g. mongodb.query, postgresql, http.request..."
                                    className="w-full bg-[#1A1C23] border border-gray-700/60 text-white text-sm rounded-xl px-4 py-2.5 focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20 outline-none placeholder:text-gray-600 transition-all shadow-inner" />
                            </div>
                            <div className="flex items-center justify-between bg-[#1A1C23]/60 border border-gray-700/50 rounded-xl px-5 py-4 transition-colors hover:border-gray-600/50 group cursor-pointer" onClick={() => setExportErrorOnly(!exportErrorOnly)}>
                                <div className="flex items-center gap-4">
                                    <div className={`p-2 rounded-lg transition-colors duration-300 ${exportErrorOnly ? 'bg-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.15)]' : 'bg-gray-800'}`}>
                                        <AlertTriangle className={`w-4 h-4 transition-colors duration-300 ${exportErrorOnly ? 'text-red-400' : 'text-gray-500'}`} />
                                    </div>
                                    <div>
                                        <span className="text-sm text-gray-200 font-medium block">Errors Only</span>
                                        <span className="text-[10px] text-gray-500 mt-0.5 block">(spans with ERROR status)</span>
                                    </div>
                                </div>
                                <button type="button" className={`relative w-11 h-6 rounded-full transition-all duration-300 outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0B0C10] focus:ring-red-500/50 ${exportErrorOnly ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]' : 'bg-gray-700'}`}>
                                    <span className={`absolute top-0.5 left-1 w-5 h-5 bg-white rounded-full transition-transform duration-300 shadow-sm ${exportErrorOnly ? 'translate-x-4' : 'translate-x-0'}`} />
                                </button>
                            </div>
                            {exportError && (
                                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm animate-fade-in flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                    <span>{exportError}</span>
                                </div>
                            )}
                            <p className="text-[10px] text-gray-600 leading-relaxed max-w-[90%]">
                                Up to 2,000 spans, slowest first. Columns: traceId, spanName, service, startTime, durationMs, status, db.system, db.statement, http.method, http.url, net.peer.name, rpc.service, messaging.destination
                            </p>
                        </div>
                        <div className="px-6 py-5 border-t border-gray-800/80 bg-white/[0.02] rounded-b-2xl flex justify-end gap-3">
                            <button onClick={() => setIsExportModalOpen(false)}
                                className="px-5 py-2.5 text-sm font-medium text-gray-400 hover:text-white bg-transparent border border-gray-700 hover:border-gray-500 rounded-xl transition-all hover:bg-white/5">
                                Cancel
                            </button>
                            <button disabled={isExporting} onClick={async () => {
                                try {
                                    setIsExporting(true);
                                    setExportError(null);
                                    const baseUrl = import.meta.env.VITE_API_URL || '';
                                    const ctxPath = import.meta.env.VITE_BACKEND_CONTEXT_PATH || '';
                                    const params = new URLSearchParams();
                                    // todayDate YYYY-MM-DD + HH:MM:SS AM/PM → JS treats as local (IST) → toISOString() = UTC
                                    const todayDate = new Date().toLocaleDateString('en-CA');
                                    
                                    const parseUserTime = (timeStr: string) => {
                                        const cleanTimeStr = timeStr.trim().replace(/([ap]m)/i, ' $1').toUpperCase();
                                        const d = new Date(`${todayDate} ${cleanTimeStr}`);
                                        if (isNaN(d.getTime())) {
                                            throw new Error(`Invalid time format: "${timeStr}". Try "11:03:55 PM"`);
                                        }
                                        return d;
                                    };

                                    if (exportFromTime) params.append('from', parseUserTime(exportFromTime).toISOString());
                                    if (exportToTime) params.append('to', parseUserTime(exportToTime).toISOString());
                                    if (exportService) params.append('service', exportService);
                                    if (exportMinDuration > 0) params.append('minDuration', exportMinDuration.toString());
                                    if (exportErrorOnly) params.append('errorOnly', 'true');
                                    if (exportSpanSearch.trim()) params.append('search', exportSpanSearch.trim());
                                    const url = `${baseUrl}${ctxPath}/api/apm/export?${params.toString()}`;
                                    const res = await fetch(url);
                                    if (!res.ok) {
                                        const err = await res.json().catch(() => ({ error: 'No data found for these filters.' }));
                                        setExportError(err.error || 'Export failed.');
                                        return;
                                    }
                                    const blob = await res.blob();
                                    const disposition = res.headers.get('Content-Disposition') || '';
                                    const filenameMatch = disposition.match(/filename="(.+?)"/);
                                    const filename = filenameMatch ? filenameMatch[1] : 'slow-queries.csv';
                                    const link = document.createElement('a');
                                    link.href = URL.createObjectURL(blob);
                                    link.download = filename;
                                    link.click();
                                    URL.revokeObjectURL(link.href);
                                    setIsExportModalOpen(false);
                                } catch (e: any) {
                                    setExportError('Network error: ' + e.message);
                                } finally {
                                    setIsExporting(false);
                                }
                            }} className="px-6 py-2.5 text-sm font-semibold bg-green-600 hover:bg-green-500 disabled:bg-green-800/50 disabled:cursor-not-allowed text-white rounded-xl transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)] hover:shadow-[0_0_25px_rgba(34,197,94,0.5)] hover:-translate-y-0.5 flex items-center gap-2 border border-green-500/50 disabled:border-transparent disabled:hover:translate-y-0 disabled:hover:shadow-[0_0_15px_rgba(34,197,94,0.3)]">
                                {isExporting
                                    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Exporting...</>
                                    : <><Download className="w-4 h-4" /> Download CSV</>
                                }
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
