import { AlertTriangle } from 'lucide-react';
import { timeAgo } from '../utils/k8sHelpers';

export interface K8sNamespaceOverviewProps {
    data: {
        pods: any[];
        deployments: any[];
        services: any[];
        configMaps: any[];
        secrets: any[];
        events: any[];
        metrics: any[];
    } | null;
    onSwitchTab: (tab: string) => void;
    onSelectItem: (item: any) => void;
}

export function K8sNamespaceOverview({ data, onSwitchTab, onSelectItem }: K8sNamespaceOverviewProps) {
    if (!data) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4" />
                <p className="text-gray-400 text-xs font-mono">Gathering namespace telemetry...</p>
            </div>
        );
    }

    const { pods = [], deployments = [], services = [], configMaps = [], secrets = [], events = [], metrics = [] } = data;

    // 1. Pod Health Calculations
    const totalPods = pods.length;
    const runningPods = pods.filter((p: any) => {
        const s = String(p.status || '').toLowerCase();
        return (s.includes('running') || s.includes('completed')) && !p.isTerminating;
    }).length;
    const terminatingPods = pods.filter((p: any) => p.isTerminating).length;
    const failingPods = pods.filter((p: any) => {
        const s = String(p.status || '').toLowerCase();
        return s.includes('error') || s.includes('fail') || s.includes('crash') || s.includes('backoff') || s.includes('imagepull');
    }).length;
    const pendingPods = totalPods - runningPods - terminatingPods - failingPods;

    // 2. Deployment Health Calculations
    const totalDeployments = deployments.length;
    const healthyDeployments = deployments.filter((d: any) => d.readyReplicas >= d.replicas).length;
    const degradedDeployments = totalDeployments - healthyDeployments;

    // 3. Resource Metric parsing and summing
    let totalCpuM = 0;
    let totalMemMi = 0;
    
    // Track pod-level usage to find the top resource consumers
    const podUsageList: { name: string; cpu: number; memory: number }[] = [];

    metrics.forEach((m: any) => {
        let podCpu = 0;
        let podMem = 0;
        m.containers.forEach((c: any) => {
            const cpu = c.cpu || '0';
            if (cpu.endsWith('n')) podCpu += parseInt(cpu) / 1_000_000;
            else if (cpu.endsWith('m')) podCpu += parseInt(cpu);
            else if (!isNaN(parseInt(cpu))) podCpu += parseInt(cpu);
            
            const mem = c.memory || '0';
            if (mem.endsWith('Ki')) podMem += parseInt(mem) / 1024;
            else if (mem.endsWith('Mi')) podMem += parseFloat(mem);
            else if (mem.endsWith('Gi')) podMem += parseFloat(mem) * 1024;
            else if (!isNaN(parseFloat(mem))) podMem += parseFloat(mem);
        });

        totalCpuM += podCpu;
        totalMemMi += podMem;
        podUsageList.push({ name: m.name, cpu: podCpu, memory: podMem });
    });

    // Sort to get top 3 resource consumers
    const topCpuPods = [...podUsageList].sort((a, b) => b.cpu - a.cpu).slice(0, 3);
    const topMemPods = [...podUsageList].sort((a, b) => b.memory - a.memory).slice(0, 3);

    // Filter Warning events
    const warningEvents = events.filter((e: any) => e.type === 'Warning');

    return (
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar h-full">
            <div>
                <h2 className="text-xl font-bold text-white mb-1">Namespace Overview</h2>
                <p className="text-xs text-gray-500 font-mono">Real-time health telemetry & resource utilization</p>
            </div>

            {/* ── GRID 1: WORKLOAD HEALTH ────────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Pod Health Card */}
                <div 
                    onClick={() => onSwitchTab('pods')}
                    className="bg-[#1a1a1a]/40 backdrop-blur-md border border-white/5 rounded-2xl p-5 hover:border-primary/30 hover:bg-[#1a1a1a]/60 cursor-pointer transition-all duration-300 group relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Pods Health</h3>
                        <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-mono font-bold">
                            {runningPods}/{totalPods} Active
                        </span>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Custom Circular Ring gauge using SVG */}
                        <div className="relative w-16 h-16 shrink-0">
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                <path
                                    className="text-gray-800"
                                    strokeWidth="3.5"
                                    stroke="currentColor"
                                    fill="none"
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                />
                                <path
                                    className="text-green-400 transition-all duration-500"
                                    strokeDasharray={`${totalPods ? (runningPods / totalPods) * 100 : 0}, 100`}
                                    strokeWidth="3.5"
                                    strokeLinecap="round"
                                    stroke="currentColor"
                                    fill="none"
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center font-mono text-sm font-bold text-white">
                                {totalPods ? Math.round((runningPods / totalPods) * 100) : 0}%
                            </div>
                        </div>

                        <div className="space-y-1 text-xs">
                            <div className="flex items-center gap-1.5 text-gray-300">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                                <span>{runningPods} Running</span>
                            </div>
                            {failingPods > 0 && (
                                <div className="flex items-center gap-1.5 text-red-400 font-medium">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                    <span>{failingPods} Failing</span>
                                </div>
                            )}
                            {terminatingPods > 0 && (
                                <div className="flex items-center gap-1.5 text-orange-400 font-medium">
                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                                    <span>{terminatingPods} Terminating</span>
                                </div>
                            )}
                            {pendingPods > 0 && (
                                <div className="flex items-center gap-1.5 text-yellow-400">
                                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                                    <span>{pendingPods} Pending</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Deployment Health Card */}
                <div 
                    onClick={() => onSwitchTab('deployments')}
                    className="bg-[#1a1a1a]/40 backdrop-blur-md border border-white/5 rounded-2xl p-5 hover:border-yellow-500/30 hover:bg-[#1a1a1a]/60 cursor-pointer transition-all duration-300 group relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-500/5 rounded-full blur-2xl group-hover:bg-yellow-500/10 transition-colors" />
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Deployments</h3>
                        <span className={`text-[10px] border px-2 py-0.5 rounded-full font-mono font-bold ${degradedDeployments > 0 ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-green-500/10 text-green-400 border-green-500/20'}`}>
                            {healthyDeployments}/{totalDeployments} Healthy
                        </span>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="relative w-16 h-16 shrink-0">
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                <path
                                    className="text-gray-800"
                                    strokeWidth="3.5"
                                    stroke="currentColor"
                                    fill="none"
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                />
                                <path
                                    className="text-yellow-400 transition-all duration-500"
                                    strokeDasharray={`${totalDeployments ? (healthyDeployments / totalDeployments) * 100 : 0}, 100`}
                                    strokeWidth="3.5"
                                    strokeLinecap="round"
                                    stroke="currentColor"
                                    fill="none"
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center font-mono text-sm font-bold text-white">
                                {totalDeployments ? Math.round((healthyDeployments / totalDeployments) * 100) : 0}%
                            </div>
                        </div>

                        <div className="space-y-1 text-xs">
                            <div className="text-gray-300">
                                Total: <span className="font-mono text-white font-bold">{totalDeployments}</span>
                            </div>
                            <div className="text-gray-300">
                                Desired Replicas: <span className="font-mono text-white font-bold">{deployments.reduce((acc: number, d: any) => acc + (d.replicas || 0), 0)}</span>
                            </div>
                            {degradedDeployments > 0 && (
                                <div className="text-red-400 font-medium animate-pulse">
                                    {degradedDeployments} Degraded
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Configurations & Services Overview */}
                <div className="bg-[#1a1a1a]/40 backdrop-blur-md border border-white/5 rounded-2xl p-5 hover:border-white/15 transition-all duration-300 group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-colors" />
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Other Resources</h3>

                    <div className="grid grid-cols-2 gap-4">
                        <div onClick={() => onSwitchTab('services')} className="bg-black/20 p-2.5 rounded-xl border border-white/[0.03] hover:border-primary/20 cursor-pointer transition-colors">
                            <span className="text-[10px] text-gray-500 uppercase font-mono block">Services</span>
                            <span className="text-lg font-mono font-bold text-white">{services.length}</span>
                        </div>
                        <div onClick={() => onSwitchTab('configmaps')} className="bg-black/20 p-2.5 rounded-xl border border-white/[0.03] hover:border-primary/20 cursor-pointer transition-colors">
                            <span className="text-[10px] text-gray-500 uppercase font-mono block">ConfigMaps</span>
                            <span className="text-lg font-mono font-bold text-white">{configMaps.length}</span>
                        </div>
                        <div onClick={() => onSwitchTab('secrets')} className="bg-black/20 p-2.5 rounded-xl border border-white/[0.03] hover:border-primary/20 cursor-pointer transition-colors col-span-2">
                            <span className="text-[10px] text-gray-500 uppercase font-mono block">Secrets (Encrypted)</span>
                            <span className="text-lg font-mono font-bold text-white">{secrets.length}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── GRID 2: REAL-TIME RESOURCE GAUGES ──────────────────────────────── */}
            {metrics.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* CPU Usage Card */}
                    <div className="bg-[#1a1a1a]/40 backdrop-blur-md border border-white/5 rounded-2xl p-5 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl" />
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">CPU Utilization</h3>
                            <span className="text-xs font-mono font-bold text-cyan-400">{Math.round(totalCpuM)}m total</span>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full bg-gray-800/50 rounded-full h-2.5 mb-4 overflow-hidden border border-white/[0.05]">
                            <div 
                                className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]" 
                                style={{ width: `${Math.min(100, (totalCpuM / 2000) * 100)}%` }} // normalized against 2 cores (2000m)
                            />
                        </div>

                        {/* Top Pods */}
                        <div className="space-y-2">
                            <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Top Consumers</h4>
                            {topCpuPods.map((p) => (
                                <div key={p.name} className="flex items-center justify-between text-xs bg-black/10 hover:bg-black/20 p-2 rounded-lg border border-white/[0.02] transition-colors">
                                    <span className="font-mono text-gray-300 truncate max-w-[200px]">{p.name}</span>
                                    <span className="font-mono text-cyan-400 font-semibold">{Math.round(p.cpu)}m</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Memory Usage Card */}
                    <div className="bg-[#1a1a1a]/40 backdrop-blur-md border border-white/5 rounded-2xl p-5 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-fuchsia-500/5 rounded-full blur-3xl" />
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Memory Utilization</h3>
                            <span className="text-xs font-mono font-bold text-fuchsia-400">{Math.round(totalMemMi)} Mi total</span>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full bg-gray-800/50 rounded-full h-2.5 mb-4 overflow-hidden border border-white/[0.05]">
                            <div 
                                className="bg-gradient-to-r from-fuchsia-500 to-pink-500 h-full rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(217,70,239,0.5)]" 
                                style={{ width: `${Math.min(100, (totalMemMi / 4096) * 100)}%` }} // normalized against 4Gi (4096Mi)
                            />
                        </div>

                        {/* Top Pods */}
                        <div className="space-y-2">
                            <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Top Consumers</h4>
                            {topMemPods.map((p) => (
                                <div key={p.name} className="flex items-center justify-between text-xs bg-black/10 hover:bg-black/20 p-2 rounded-lg border border-white/[0.02] transition-colors">
                                    <span className="font-mono text-gray-300 truncate max-w-[200px]">{p.name}</span>
                                    <span className="font-mono text-fuchsia-400 font-semibold">{Math.round(p.memory)} Mi</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
                    <AlertTriangle className="w-8 h-8 text-yellow-500/80 mb-2 animate-bounce" />
                    <h3 className="text-sm font-semibold text-yellow-500/90 mb-1">Metrics Server Not Available</h3>
                    <p className="text-xs text-gray-500 max-w-md">
                        Please deploy the Kubernetes Metrics Server in your cluster to unlock real-time resource utilization gauges, pod sparklines, and CPU/Memory graphs.
                    </p>
                </div>
            )}

            {/* ── GRID 3: TIMELINE EVENT WATCHER ─────────────────────────────────── */}
            <div className="bg-[#1a1a1a]/40 backdrop-blur-md border border-white/5 rounded-2xl overflow-hidden shadow-inner">
                <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-400 animate-pulse" />
                        <h3 className="font-semibold text-sm text-gray-200">Namespace Alarm & Event Stream</h3>
                    </div>
                    <button 
                        onClick={() => onSwitchTab('events')} 
                        className="text-xs text-primary hover:text-blue-300 transition-colors uppercase tracking-wider font-bold"
                    >
                        View All Events →
                    </button>
                </div>

                <div className="divide-y divide-white/[0.03]">
                    {warningEvents.length === 0 ? (
                        <div className="p-10 text-center flex flex-col items-center justify-center text-gray-500">
                            <span className="text-green-400 text-3xl mb-2">🛡️</span>
                            <span className="text-xs font-mono">No warning alerts active in this namespace!</span>
                        </div>
                    ) : (
                        warningEvents.slice(0, 6).map((ev: any, i: number) => (
                            <div 
                                key={i} 
                                onClick={() => onSelectItem({ type: 'events', data: ev })}
                                className="px-5 py-3.5 flex items-start gap-4 hover:bg-white/[0.02] cursor-pointer transition-colors group"
                            >
                                <span className="text-[10px] font-bold text-orange-400 bg-orange-400/10 border border-orange-500/20 px-2 py-0.5 rounded uppercase tracking-wider shrink-0 mt-0.5">
                                    {ev.reason}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs text-gray-300 font-medium leading-relaxed group-hover:text-white transition-colors">{ev.message}</div>
                                    <div className="text-[10px] text-gray-500 mt-1.5 flex items-center gap-2">
                                        <span className="text-primary font-mono">{ev.involvedKind}: {ev.involvedObject}</span>
                                        <span>•</span>
                                        <span>{timeAgo(ev.lastTimestamp)} ago</span>
                                        <span>•</span>
                                        <span className="bg-white/5 border border-white/10 text-gray-400 px-1.5 py-0.2 rounded font-mono font-bold">{ev.count} alerts</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
