import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    RefreshCw, ChevronDown, AlertTriangle, CheckCircle2, XCircle,
    Clock, Box, Layers, Zap, MemoryStick, ServerCrash, Activity, Network,
    Search, X, Info
} from 'lucide-react';
import { useKubernetes, KubePod, KubeMetric } from '../hooks/useKubernetes';

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCpu(cpu: string): string {
    if (!cpu) return '—';
    if (cpu.endsWith('n')) return `${Math.round(parseInt(cpu) / 1_000_000)}m`;
    return cpu;
}

function parseMemory(mem: string): string {
    if (!mem) return '—';
    if (mem.endsWith('Ki')) return `${Math.round(parseInt(mem) / 1024)} Mi`;
    if (mem.endsWith('Gi')) return `${(parseFloat(mem) * 1024).toFixed(0)} Mi`;
    if (mem.endsWith('Mi')) return mem;
    return mem;
}

function getMetricForPod(metrics: KubeMetric[], podName: string) {
    const m = metrics.find(m => m.name === podName);
    if (!m || !m.containers.length) return { cpu: '—', memory: '—' };
    let totalCpuM = 0;
    let totalMemMi = 0;
    m.containers.forEach(c => {
        const cpu = c.cpu;
        if (cpu.endsWith('n')) totalCpuM += parseInt(cpu) / 1_000_000;
        else if (cpu.endsWith('m')) totalCpuM += parseInt(cpu);
        const mem = c.memory;
        if (mem.endsWith('Ki')) totalMemMi += parseInt(mem) / 1024;
        else if (mem.endsWith('Mi')) totalMemMi += parseFloat(mem);
        else if (mem.endsWith('Gi')) totalMemMi += parseFloat(mem) * 1024;
    });
    return {
        cpu: `${Math.round(totalCpuM)}m`,
        memory: `${Math.round(totalMemMi)} Mi`,
    };
}

function timeAgo(iso: string | null): string {
    if (!iso) return '—';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return `${Math.round(diff)}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
}

function PodStatusBadge({ status, lastTerminationReason }: { status: string; lastTerminationReason?: string }) {
    const isOOM = lastTerminationReason === 'OOMKilled';
    const s = status?.toLowerCase();
    const cfg =
        isOOM ? { cls: 'bg-orange-500/20 text-orange-400 border-orange-500/30', label: 'OOMKilled' } :
            s === 'running' ? { cls: 'bg-green-500/20 text-green-400 border-green-500/30', label: 'Running' } :
                s === 'pending' ? { cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', label: 'Pending' } :
                    s === 'succeeded' ? { cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30', label: 'Succeeded' } :
                        { cls: 'bg-red-500/20 text-red-400 border-red-500/30', label: status || 'Unknown' };
    return (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.cls}`}>
            {cfg.label}
        </span>
    );
}

// ── Slide-over Detail Panel ───────────────────────────────────────────────────

function DetailPanel({ item, onClose }: { item: any, onClose: () => void }) {
    if (!item) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-xl bg-bg-surface border-l border-gray-800 shadow-2xl flex flex-col h-full overflow-hidden animate-slide-in-right">
                <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-bg-elevated">
                    <div className="flex items-center gap-3">
                        {item.type === 'pod' ? <Box className="w-5 h-5 text-primary" /> :
                            item.type === 'deployment' ? <Activity className="w-5 h-5 text-green-400" /> :
                                <AlertTriangle className="w-5 h-5 text-yellow-400" />}
                        <h2 className="text-lg font-semibold text-white truncate max-w-[350px]" title={item.data.name}>
                            {item.data.name}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Common Metadata */}
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Metadata</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div><span className="text-gray-500 text-xs block">Namespace</span><span className="text-sm font-mono text-white">{item.data.namespace || '—'}</span></div>
                            {item.data.startTime && <div><span className="text-gray-500 text-xs block">Created</span><span className="text-sm text-white">{new Date(item.data.startTime).toLocaleString()}</span></div>}
                            {item.data.nodeName && <div><span className="text-gray-500 text-xs block">Node</span><span className="text-sm font-mono text-white">{item.data.nodeName}</span></div>}
                            {item.data.podIP && <div><span className="text-gray-500 text-xs block">IP Address</span><span className="text-sm font-mono text-white">{item.data.podIP}</span></div>}
                        </div>
                        {item.data.labels && Object.keys(item.data.labels).length > 0 && (
                            <div className="mt-4">
                                <span className="text-gray-500 text-xs block mb-2">Labels</span>
                                <div className="flex flex-wrap gap-2">
                                    {Object.entries(item.data.labels).map(([k, v]) => (
                                        <span key={k} className="text-[10px] font-mono bg-white/10 text-gray-300 px-2 py-1 rounded">
                                            {k}: {v as string}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Pod Specific */}
                    {item.type === 'pod' && item.data.containers && (
                        <div>
                            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Containers</h3>
                            <div className="space-y-3">
                                {item.data.containers.map((c: any, i: number) => (
                                    <div key={i} className="bg-white/5 border border-white/10 rounded-lg p-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-mono text-sm text-primary">{c.name}</span>
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${c.ready ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                                {c.ready ? 'Ready' : 'Not Ready'}
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-400 font-mono break-all mb-2">{c.image}</div>
                                        <div className="flex gap-4 text-xs">
                                            <span>State: <span className="text-white capitalize">{c.state}</span></span>
                                            <span>Restarts: <span className={c.restartCount > 0 ? 'text-orange-400' : 'text-white'}>{c.restartCount}</span></span>
                                            {c.stateReason && <span className="text-orange-400">Reason: {c.stateReason}</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Conditions */}
                    {item.data.conditions && item.data.conditions.length > 0 && (
                        <div>
                            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Conditions</h3>
                            <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-white/5 text-gray-400">
                                        <tr><th className="px-3 py-2">Type</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Reason</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/10">
                                        {item.data.conditions.map((c: any, i: number) => (
                                            <tr key={i}>
                                                <td className="px-3 py-2 text-white">{c.type}</td>
                                                <td className="px-3 py-2">
                                                    <span className={c.status === 'True' ? 'text-green-400' : 'text-red-400'}>{c.status}</span>
                                                </td>
                                                <td className="px-3 py-2 text-gray-400 truncate max-w-[150px]" title={c.message}>{c.reason !== '—' ? c.reason : c.message}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Event Specific */}
                    {item.type === 'event' && (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
                            <h3 className="text-xs font-semibold text-yellow-500 uppercase tracking-wider mb-3">Event Details</h3>
                            <div className="space-y-3 text-sm">
                                <div><span className="text-yellow-600/70 block text-xs">Message</span><span className="text-gray-200">{item.data.message}</span></div>
                                <div><span className="text-yellow-600/70 block text-xs">Reason</span><span className="text-yellow-400 font-mono">{item.data.reason}</span></div>
                                <div><span className="text-yellow-600/70 block text-xs">Involved Object</span><span className="text-gray-300 font-mono">{item.data.involvedKind}: {item.data.involvedObject}</span></div>
                                <div><span className="text-yellow-600/70 block text-xs">Occurrences</span><span className="text-gray-300">{item.data.count} (Last: {new Date(item.data.lastTimestamp).toLocaleString()})</span></div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

// ── Not Configured Empty State ────────────────────────────────────────────────

function NotConfigured() {
    return (
        <div className="flex-1 flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
                <Network className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">Kubernetes Not Configured</h2>
            <p className="text-gray-400 max-w-md mb-2">
                Deploy kubiq on the same VM where you run <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-sm">kubectl</code> commands to enable pod monitoring.
            </p>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function KubernetesDashboard() {
    const {
        available, context, namespaces, selectedNamespace, setSelectedNamespace,
        pods, metrics, events, deployments, loading, refresh,
    } = useKubernetes();

    const [activeTab, setActiveTab] = useState<'overview' | 'deployments' | 'pods' | 'events'>('overview');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedItem, setSelectedItem] = useState<{ type: 'pod' | 'deployment' | 'event', data: any } | null>(null);

    // Namespace portal dropdown state
    const nsTriggerRef = useRef<HTMLButtonElement>(null);
    const nsPanelRef = useRef<HTMLDivElement>(null);
    const [isNsOpen, setIsNsOpen] = useState(false);
    const [nsRect, setNsRect] = useState<{ top: number; left: number; width: number } | null>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!nsTriggerRef.current?.contains(t) && !nsPanelRef.current?.contains(t)) {
                setIsNsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Summary stats
    const runningPods = pods.filter(p => p.status === 'Running').length;
    const totalRestarts = pods.reduce((s, p) => s + p.restarts, 0);
    const degradedDeps = deployments.filter(d => d.readyReplicas < d.replicas).length;
    const warningEvents = events.length;

    const statsCards = [
        { label: 'Total Pods', value: pods.length, icon: Box, color: 'text-blue-400', bg: 'from-blue-500/10' },
        { label: 'Running', value: runningPods, icon: CheckCircle2, color: 'text-green-400', bg: 'from-green-500/10' },
        { label: 'Total Restarts', value: totalRestarts, icon: RefreshCw, color: totalRestarts > 0 ? 'text-orange-400' : 'text-gray-400', bg: 'from-orange-500/10' },
        { label: 'Degraded Deploys', value: degradedDeps, icon: ServerCrash, color: degradedDeps > 0 ? 'text-red-400' : 'text-gray-400', bg: 'from-red-500/10' },
        { label: 'Warning Events', value: warningEvents, icon: AlertTriangle, color: warningEvents > 0 ? 'text-yellow-400' : 'text-gray-400', bg: 'from-yellow-500/10' },
    ];

    // Filtered data
    const filteredPods = useMemo(() => pods.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())), [pods, searchQuery]);
    const filteredDeps = useMemo(() => deployments.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase())), [deployments, searchQuery]);
    const filteredEvents = useMemo(() => events.filter(e => e.message.toLowerCase().includes(searchQuery.toLowerCase()) || e.involvedObject.toLowerCase().includes(searchQuery.toLowerCase())), [events, searchQuery]);


    if (available === null) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
            </div>
        );
    }

    return (
        <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto w-full animate-fade-in relative z-10 flex flex-col h-full">
            {/* Background */}
            <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-br from-bg via-bg to-bg-surface" />
                <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
            </div>

            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 shrink-0">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 flex items-center gap-3">
                        <Network className="w-7 h-7 text-primary" /> Kubernetes Monitor
                    </h1>
                    <p className="text-gray-400 mt-1 text-sm">
                        {available
                            ? <>Connected to cluster — <code className="text-primary text-xs bg-primary/10 px-1.5 py-0.5 rounded">{context}</code></>
                            : 'Cluster not reachable'
                        }
                    </p>
                </div>

                {available && (
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Namespace Dropdown */}
                        <div className="relative">
                            <button
                                ref={nsTriggerRef}
                                type="button"
                                onClick={() => {
                                    if (!isNsOpen && nsTriggerRef.current) {
                                        const r = nsTriggerRef.current.getBoundingClientRect();
                                        setNsRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 160) });
                                    }
                                    setIsNsOpen(o => !o);
                                }}
                                className="bg-bg-elevated border border-gray-700 hover:border-primary/50 text-gray-300 text-sm rounded-lg flex items-center justify-between gap-2 px-3 py-2.5 transition-colors focus:outline-none min-w-[160px]"
                            >
                                <Layers className="w-4 h-4 text-gray-400 shrink-0" />
                                <span className="flex-1 text-left">{selectedNamespace || 'Select namespace'}</span>
                                <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isNsOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isNsOpen && nsRect && createPortal(
                                <div
                                    ref={nsPanelRef}
                                    style={{ position: 'fixed', top: nsRect.top, left: nsRect.left, width: nsRect.width, zIndex: 9999 }}
                                    className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto"
                                >
                                    {namespaces.map(ns => (
                                        <button
                                            key={ns}
                                            type="button"
                                            onClick={() => { setSelectedNamespace(ns); setIsNsOpen(false); }}
                                            className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-primary/20 flex items-center gap-2 ${selectedNamespace === ns ? 'text-primary font-medium' : 'text-gray-300'}`}
                                        >
                                            <Layers className="w-3.5 h-3.5 opacity-50" /> {ns}
                                        </button>
                                    ))}
                                </div>,
                                document.body
                            )}
                        </div>

                        <button
                            onClick={refresh}
                            disabled={loading}
                            className="bg-bg-elevated border border-gray-700 hover:border-primary/50 text-gray-300 text-sm rounded-lg flex items-center gap-2 px-3 py-2.5 transition-colors"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                    </div>
                )}
            </div>

            {!available ? (
                <NotConfigured />
            ) : (
                <div className="flex flex-col flex-1 overflow-hidden">
                    {/* Navigation Tabs */}
                    <div className="flex items-center gap-6 border-b border-gray-800 mb-6 shrink-0">
                        {(['overview', 'deployments', 'pods', 'events'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === tab ? 'text-primary' : 'text-gray-400 hover:text-gray-200'}`}
                            >
                                <span className="capitalize">{tab}</span>
                                {tab === 'deployments' && <span className="ml-2 text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full">{deployments.length}</span>}
                                {tab === 'pods' && <span className="ml-2 text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full">{pods.length}</span>}
                                {tab === 'events' && warningEvents > 0 && <span className="ml-2 text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">{warningEvents}</span>}
                                {activeTab === tab && (
                                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                                )}
                            </button>
                        ))}

                        {/* Search Bar - Only show on list tabs */}
                        {activeTab !== 'overview' && (
                            <div className="ml-auto pb-2 relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder={`Search ${activeTab}...`}
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="bg-bg-elevated border border-gray-800 text-sm text-white rounded-lg pl-9 pr-4 py-1.5 focus:outline-none focus:border-primary/50 w-64 transition-all"
                                />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Tab Content Area (Scrollable internally if needed) */}
                    <div className="flex-1 overflow-y-auto pr-2 pb-6 custom-scrollbar">

                        {/* ── OVERVIEW TAB ── */}
                        {activeTab === 'overview' && (
                            <div className="space-y-6 animate-fade-in">
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                                    {statsCards.map(card => (
                                        <div key={card.label} className={`bg-bg-surface/40 backdrop-blur-md border border-gray-800 rounded-xl p-4 bg-gradient-to-br ${card.bg} to-transparent`}>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs text-gray-500 font-medium">{card.label}</span>
                                                <card.icon className={`w-4 h-4 ${card.color}`} />
                                            </div>
                                            <div className={`text-2xl font-bold ${card.color}`}>{loading ? '—' : card.value}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Top warnings preview */}
                                {events.length > 0 ? (
                                    <div className="bg-bg-surface/40 backdrop-blur-md border border-yellow-500/20 rounded-xl overflow-hidden">
                                        <div className="p-4 border-b border-yellow-500/20 flex items-center justify-between bg-yellow-500/5">
                                            <div className="flex items-center gap-2">
                                                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                                                <h2 className="font-semibold text-yellow-300">Recent Warnings</h2>
                                            </div>
                                            <button onClick={() => setActiveTab('events')} className="text-xs text-yellow-500 hover:text-yellow-300 transition-colors">View All →</button>
                                        </div>
                                        <div className="divide-y divide-gray-800/40">
                                            {events.slice(0, 5).map((ev, i) => (
                                                <div key={i} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => setSelectedItem({ type: 'event', data: ev })}>
                                                    <div className="flex items-center gap-2 min-w-[160px]">
                                                        <span className="text-xs font-semibold text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded">{ev.reason}</span>
                                                    </div>
                                                    <div className="flex-1 text-xs text-gray-300 truncate">{ev.message}</div>
                                                    <div className="text-xs text-gray-600 shrink-0 font-mono">{ev.involvedObject}</div>
                                                    <div className="text-xs text-gray-600 shrink-0">{timeAgo(ev.lastTimestamp)} ago</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-bg-surface/40 backdrop-blur-md border border-gray-800 rounded-xl p-8 text-center flex flex-col items-center justify-center">
                                        <CheckCircle2 className="w-12 h-12 text-green-500/20 mb-3" />
                                        <h3 className="text-gray-300 font-medium">Cluster Healthy</h3>
                                        <p className="text-sm text-gray-500 mt-1">No warning events reported in this namespace.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── DEPLOYMENTS TAB ── */}
                        {activeTab === 'deployments' && (
                            <div className="bg-bg-surface/40 backdrop-blur-md border border-gray-800 rounded-xl overflow-hidden animate-fade-in">
                                <table className="w-full text-sm">
                                    <thead className="bg-white/[0.02] sticky top-0 z-10 backdrop-blur-md">
                                        <tr className="text-xs text-gray-500 border-b border-gray-800/50">
                                            <th className="text-left px-4 py-3 font-medium">Name</th>
                                            <th className="text-center px-4 py-3 font-medium">Desired</th>
                                            <th className="text-center px-4 py-3 font-medium">Ready</th>
                                            <th className="text-left px-4 py-3 font-medium">Status</th>
                                            <th className="text-right px-4 py-3 font-medium"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800/40">
                                        {filteredDeps.length === 0 ? (
                                            <tr><td colSpan={5} className="p-8 text-center text-gray-500">No deployments found</td></tr>
                                        ) : filteredDeps.map(d => {
                                            const healthy = d.readyReplicas >= d.replicas;
                                            return (
                                                <tr key={d.name} className="hover:bg-white/[0.04] transition-colors cursor-pointer" onClick={() => setSelectedItem({ type: 'deployment', data: d })}>
                                                    <td className="px-4 py-3 font-mono text-white text-xs">{d.name}</td>
                                                    <td className="px-4 py-3 text-center text-gray-400">{d.replicas}</td>
                                                    <td className="px-4 py-3 text-center font-medium">
                                                        <span className={d.readyReplicas >= d.replicas ? 'text-green-400' : 'text-red-400'}>
                                                            {d.readyReplicas}/{d.replicas}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {healthy
                                                            ? <span className="flex items-center gap-1.5 text-green-400 text-xs"><CheckCircle2 className="w-3.5 h-3.5" /> Healthy</span>
                                                            : <span className="flex items-center gap-1.5 text-red-400 text-xs"><XCircle className="w-3.5 h-3.5" /> Degraded</span>
                                                        }
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <Info className="w-4 h-4 text-gray-500 inline-block opacity-50" />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* ── PODS TAB ── */}
                        {activeTab === 'pods' && (
                            <div className="bg-bg-surface/40 backdrop-blur-md border border-gray-800 rounded-xl overflow-hidden animate-fade-in">
                                <table className="w-full text-sm">
                                    <thead className="bg-white/[0.02] sticky top-0 z-10 backdrop-blur-md">
                                        <tr className="text-xs text-gray-500 border-b border-gray-800/50">
                                            <th className="text-left px-4 py-3 font-medium">Pod Name</th>
                                            <th className="text-left px-4 py-3 font-medium">Status</th>
                                            <th className="text-center px-4 py-3 font-medium"><span className="flex items-center justify-center gap-1"><Zap className="w-3 h-3" /> CPU</span></th>
                                            <th className="text-center px-4 py-3 font-medium"><span className="flex items-center justify-center gap-1"><MemoryStick className="w-3 h-3" /> RAM</span></th>
                                            <th className="text-center px-4 py-3 font-medium">Restarts</th>
                                            <th className="text-center px-4 py-3 font-medium"><span className="flex items-center justify-center gap-1"><Clock className="w-3 h-3" /> Age</span></th>
                                            <th className="text-left px-4 py-3 font-medium">Node</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800/40">
                                        {filteredPods.length === 0 ? (
                                            <tr><td colSpan={7} className="p-8 text-center text-gray-500">No pods found</td></tr>
                                        ) : filteredPods.map((pod: KubePod) => {
                                            const podMetrics = getMetricForPod(metrics, pod.name);
                                            return (
                                                <tr key={pod.name} className="hover:bg-white/[0.04] transition-colors cursor-pointer" onClick={() => setSelectedItem({ type: 'pod', data: pod })}>
                                                    <td className="px-4 py-3 font-mono text-xs text-white max-w-[200px] sm:max-w-xs truncate" title={pod.name}>
                                                        {pod.name}
                                                    </td>
                                                    <td className="px-4 py-3"><PodStatusBadge status={pod.status} lastTerminationReason={pod.lastTerminationReason} /></td>
                                                    <td className="px-4 py-3 text-center font-mono text-xs text-yellow-400">{parseCpu(podMetrics.cpu)}</td>
                                                    <td className="px-4 py-3 text-center font-mono text-xs text-blue-400">{parseMemory(podMetrics.memory)}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`text-xs font-bold ${pod.restarts > 5 ? 'text-red-400' : pod.restarts > 0 ? 'text-orange-400' : 'text-gray-500'}`}>
                                                            {pod.restarts}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center text-xs text-gray-400">{timeAgo(pod.startTime)}</td>
                                                    <td className="px-4 py-3 text-xs text-gray-500 font-mono truncate max-w-[120px]" title={pod.nodeName}>{pod.nodeName}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* ── EVENTS TAB ── */}
                        {activeTab === 'events' && (
                            <div className="bg-bg-surface/40 backdrop-blur-md border border-gray-800 rounded-xl overflow-hidden animate-fade-in">
                                {filteredEvents.length === 0 ? (
                                    <div className="p-8 text-center text-gray-500">No warning events found</div>
                                ) : (
                                    <div className="divide-y divide-gray-800/40">
                                        {filteredEvents.map((ev, i) => (
                                            <div key={i} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => setSelectedItem({ type: 'event', data: ev })}>
                                                <div className="flex items-center gap-2 min-w-[160px]">
                                                    <span className="text-xs font-semibold text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded">{ev.reason}</span>
                                                </div>
                                                <div className="flex-1 text-xs text-gray-300">{ev.message}</div>
                                                <div className="text-xs text-gray-600 shrink-0 font-mono">{ev.involvedKind}: {ev.involvedObject}</div>
                                                <div className="text-xs text-gray-600 shrink-0">{timeAgo(ev.lastTimestamp)} ago × {ev.count}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                </div>
            )}

            {/* Detail Panel Modal */}
            <DetailPanel item={selectedItem} onClose={() => setSelectedItem(null)} />
        </div>
    );
}
