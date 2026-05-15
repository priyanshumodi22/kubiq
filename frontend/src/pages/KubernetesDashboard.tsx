import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    RefreshCw, ChevronDown, AlertTriangle, CheckCircle2, XCircle,
    Clock, Box, Layers, Zap, MemoryStick, ServerCrash, Activity, Network
} from 'lucide-react';
import { useKubernetes, KubePod, KubeMetric } from '../hooks/useKubernetes';

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCpu(cpu: string): string {
    if (!cpu) return '—';
    if (cpu.endsWith('n')) return `${Math.round(parseInt(cpu) / 1_000_000)}m`;
    return cpu; // already in millicores "142m"
}

function parseMemory(mem: string): string {
    if (!mem) return '—';
    if (mem.endsWith('Ki')) return `${Math.round(parseInt(mem) / 1024)} Mi`;
    if (mem.endsWith('Gi')) return `${(parseFloat(mem) * 1024).toFixed(0)} Mi`;
    return mem;
}

function getMetricForPod(metrics: KubeMetric[], podName: string) {
    const m = metrics.find(m => m.name === podName);
    if (!m || !m.containers.length) return { cpu: '—', memory: '—' };
    // Sum across all containers
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
            <p className="text-gray-500 text-sm max-w-sm">
                kubiq will automatically detect your <code className="text-gray-400 bg-white/5 px-1 rounded text-xs">~/.kube/config</code> and connect to your cluster — no agents needed.
            </p>
            <div className="mt-8 bg-bg-surface border border-gray-800 rounded-xl p-4 text-left font-mono text-xs text-gray-400 max-w-sm w-full">
                <div className="text-gray-500 mb-2"># Verify kubectl access</div>
                <div className="text-green-400">kubectl get namespaces</div>
                <div className="mt-2 text-gray-500"># Then restart kubiq backend</div>
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function KubernetesDashboard() {
    const {
        available, context, namespaces, selectedNamespace, setSelectedNamespace,
        pods, metrics, events, deployments, loading, refresh,
    } = useKubernetes();

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

    if (available === null) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
            </div>
        );
    }

    return (
        <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full animate-fade-in relative z-10">
            {/* Background */}
            <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-br from-bg via-bg to-bg-surface" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.05),transparent_50%)]" />
                <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
                <div className="absolute top-1/3 -right-20 w-80 h-80 bg-primary/3 rounded-full blur-3xl" />
            </div>

            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
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
                    <div className="flex items-center gap-3">
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
                                className="bg-bg-elevated border border-gray-700 hover:border-primary/50 text-gray-300 text-sm rounded-lg flex items-center justify-between gap-2 px-3 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-[160px]"
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
                <div className="space-y-6">
                    {/* Stat Cards */}
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

                    {/* Deployments */}
                    {deployments.length > 0 && (
                        <div className="bg-bg-surface/40 backdrop-blur-md border border-gray-800 rounded-xl overflow-hidden">
                            <div className="p-4 border-b border-gray-800 flex items-center gap-2">
                                <Activity className="w-4 h-4 text-primary" />
                                <h2 className="font-semibold text-white">Deployments</h2>
                                <span className="text-xs text-gray-500 ml-1">({deployments.length})</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-xs text-gray-500 border-b border-gray-800/50">
                                            <th className="text-left px-4 py-2.5 font-medium">Name</th>
                                            <th className="text-center px-4 py-2.5 font-medium">Desired</th>
                                            <th className="text-center px-4 py-2.5 font-medium">Ready</th>
                                            <th className="text-left px-4 py-2.5 font-medium">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800/40">
                                        {deployments.map(d => {
                                            const healthy = d.readyReplicas >= d.replicas;
                                            return (
                                                <tr key={d.name} className="hover:bg-white/[0.02] transition-colors">
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
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Pods Table */}
                    <div className="bg-bg-surface/40 backdrop-blur-md border border-gray-800 rounded-xl overflow-hidden">
                        <div className="p-4 border-b border-gray-800 flex items-center gap-2">
                            <Box className="w-4 h-4 text-primary" />
                            <h2 className="font-semibold text-white">Pods</h2>
                            <span className="text-xs text-gray-500 ml-1">({pods.length})</span>
                            {metrics.length === 0 && (
                                <span className="ml-auto text-xs text-yellow-500/80 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> Metrics Server not detected — CPU/RAM unavailable
                                </span>
                            )}
                        </div>
                        {loading ? (
                            <div className="p-8 text-center text-gray-500 text-sm">Loading pods...</div>
                        ) : pods.length === 0 ? (
                            <div className="p-8 text-center text-gray-500 text-sm">No pods found in namespace <strong className="text-gray-400">{selectedNamespace}</strong></div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-xs text-gray-500 border-b border-gray-800/50">
                                            <th className="text-left px-4 py-2.5 font-medium">Pod Name</th>
                                            <th className="text-left px-4 py-2.5 font-medium">Status</th>
                                            <th className="text-center px-4 py-2.5 font-medium">
                                                <span className="flex items-center justify-center gap-1"><Zap className="w-3 h-3" /> CPU</span>
                                            </th>
                                            <th className="text-center px-4 py-2.5 font-medium">
                                                <span className="flex items-center justify-center gap-1"><MemoryStick className="w-3 h-3" /> RAM</span>
                                            </th>
                                            <th className="text-center px-4 py-2.5 font-medium">Restarts</th>
                                            <th className="text-center px-4 py-2.5 font-medium">
                                                <span className="flex items-center justify-center gap-1"><Clock className="w-3 h-3" /> Age</span>
                                            </th>
                                            <th className="text-left px-4 py-2.5 font-medium">Node</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800/40">
                                        {pods.map((pod: KubePod) => {
                                            const podMetrics = getMetricForPod(metrics, pod.name);
                                            return (
                                                <tr key={pod.name} className="hover:bg-white/[0.02] transition-colors group">
                                                    <td className="px-4 py-3 font-mono text-xs text-white max-w-[200px] truncate" title={pod.name}>
                                                        {pod.name}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <PodStatusBadge status={pod.status} lastTerminationReason={pod.lastTerminationReason} />
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-mono text-xs text-yellow-400">
                                                        {parseCpu(podMetrics.cpu)}
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-mono text-xs text-blue-400">
                                                        {parseMemory(podMetrics.memory)}
                                                    </td>
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
                    </div>

                    {/* Warning Events */}
                    {events.length > 0 && (
                        <div className="bg-bg-surface/40 backdrop-blur-md border border-yellow-500/20 rounded-xl overflow-hidden">
                            <div className="p-4 border-b border-yellow-500/20 flex items-center gap-2 bg-yellow-500/5">
                                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                                <h2 className="font-semibold text-yellow-300">Warning Events</h2>
                                <span className="text-xs text-yellow-600 ml-1">({events.length})</span>
                            </div>
                            <div className="divide-y divide-gray-800/40">
                                {events.map((ev, i) => (
                                    <div key={i} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 hover:bg-white/[0.02] transition-colors">
                                        <div className="flex items-center gap-2 min-w-[160px]">
                                            <span className="text-xs font-semibold text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded">{ev.reason}</span>
                                        </div>
                                        <div className="flex-1 text-xs text-gray-300">{ev.message}</div>
                                        <div className="text-xs text-gray-600 shrink-0 font-mono">{ev.involvedObject}</div>
                                        <div className="text-xs text-gray-600 shrink-0">{timeAgo(ev.lastTimestamp)} ago × {ev.count}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
