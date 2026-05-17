import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    Activity, Box, Network, Globe, Settings, Server, Database,
    AlertTriangle, Search, X, ChevronDown, FileJson, Layers, RefreshCw
} from 'lucide-react';

import { useKubernetes, KubeMetric } from '../hooks/useKubernetes';
import { apiClient } from '../services/api';
import { K8sPodStatusBadge } from '../components/K8sPodStatusBadge';
import { K8sMiniSparkline } from '../components/K8sMiniSparkline';
import { K8sNamespaceOverview } from '../components/K8sNamespaceOverview';
import { K8sRelationshipMap } from '../components/K8sRelationshipMap';
import { K8sDetailPanel } from '../components/K8sDetailPanel';
import { 
    parseCpu, parseMemory, getMetricForPod, timeAgo 
} from '../utils/k8sHelpers';



// ── Not Configured Empty State ────────────────────────────────────────────────

function NotConfigured() {
    return (
        <div className="flex-1 flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
                <Network className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">Kubernetes Not Configured</h2>
            <p className="text-gray-400 max-w-md mb-2">
                Deploy kubiq on the same VM where you run <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-sm">kubectl</code> commands to enable cluster inspection.
            </p>
        </div>
    );
}

// ── Sidebar Config ────────────────────────────────────────────────────────────

const SIDEBAR_MENU = [
    { id: 'overview', label: 'Overview', icon: Activity, type: 'overview' },
    { id: 'topology', label: 'Service Topology', icon: Network, type: 'topology' },
    { 
        id: 'workloads', label: 'Workloads', icon: Box, children: [
            { id: 'deployments', label: 'Deployments', type: 'deployments' },
            { id: 'pods', label: 'Pods', type: 'pods' },
        ]
    },
    {
        id: 'network', label: 'Network', icon: Globe, children: [
            { id: 'services', label: 'Services', type: 'services' },
            { id: 'endpoints', label: 'Endpoints', type: 'endpoints' },
            { id: 'ingresses', label: 'Ingresses', type: 'ingresses' },
        ]
    },
    {
        id: 'storage', label: 'Storage', icon: Database, children: [
            { id: 'persistentvolumes', label: 'Persistent Volumes', type: 'persistentvolumes' },
            { id: 'persistentvolumeclaims', label: 'Persistent Volume Claims', type: 'persistentvolumeclaims' },
            { id: 'storageclasses', label: 'Storage Classes', type: 'storageclasses' },
        ]
    },
    {
        id: 'config', label: 'Configuration', icon: Settings, children: [
            { id: 'configmaps', label: 'Config Maps', type: 'configmaps' },
            { id: 'secrets', label: 'Secrets', type: 'secrets' },
        ]
    },
    { id: 'nodes', label: 'Nodes', icon: Server, type: 'nodes' },
    { id: 'events', label: 'Events', icon: AlertTriangle, type: 'events' },
];



// ── Main Page ─────────────────────────────────────────────────────────────────

export default function KubernetesDashboard() {
    const { 
        available, context, contexts, switchContext, namespaces, selectedNamespace, setSelectedNamespace,
        scaleDeployment, restartDeployment, deleteResource 
    } = useKubernetes();

    const formatContextName = (name: string) => {
        if (!name) return '';
        if (name.startsWith('arn:aws:eks:')) {
            const parts = name.split('/');
            const clusterName = parts[parts.length - 1];
            const regionMatch = name.match(/eks:([a-z0-9-]+):/);
            const region = regionMatch ? regionMatch[1] : '';
            return region ? `${clusterName} [EKS:${region}]` : `${clusterName} [EKS]`;
        }
        if (name.startsWith('gke_')) {
            const parts = name.split('_');
            return `${parts[parts.length - 1]} [GKE]`;
        }
        // Azure AKS: clusterName_resourceGroup_location
        if (name.includes('_') && (name.toLowerCase().includes('aks') || name.toLowerCase().includes('azure'))) {
            const parts = name.split('_');
            return `${parts[0]} [AKS]`;
        }
        return name;
    };

    const getClusterProvider = (name: string) => {
        if (!name) return 'Kubernetes Cluster';
        if (name.startsWith('arn:aws:eks:')) return 'AWS Elastic Kubernetes Service';
        if (name.startsWith('gke_')) return 'Google Kubernetes Engine';
        if (name.toLowerCase().includes('aks') || name.toLowerCase().includes('azure')) return 'Azure Kubernetes Service';
        if (name.includes('minikube')) return 'Minikube Local Development';
        if (name.includes('kind')) return 'Kind Cluster';
        if (name.includes('docker-desktop')) return 'Docker Desktop';
        return 'Kubernetes Cluster';
    };

    const [hoveredCtx, setHoveredCtx] = useState<string | null>(null);

    // Context dropdown state
    const ctxTriggerRef = useRef<HTMLButtonElement>(null);
    const ctxPanelRef = useRef<HTMLDivElement>(null);
    const [isCtxOpen, setIsCtxOpen] = useState(false);
    const [ctxRect, setCtxRect] = useState<{ top: number; left: number; width: number } | null>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!ctxTriggerRef.current?.contains(t) && !ctxPanelRef.current?.contains(t)) {
                setIsCtxOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Use our own state for all the resources
    const [activeResource, setActiveResource] = useState<string>('overview');
    const [resourceData, setResourceData] = useState<any[]>([]);
    const [overviewData, setOverviewData] = useState<any>(null);
    const [metrics, setMetrics] = useState<KubeMetric[]>([]);
    const [metricsHistory, setMetricsHistory] = useState<Record<string, { cpu: number[], memory: number[], timestamps: number[] }>>(() => {
        try {
            const saved = localStorage.getItem('kubiq_k8s_metrics_history');
            return saved ? JSON.parse(saved) : {};
        } catch {
            return {};
        }
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!metrics || metrics.length === 0) return;
        setMetricsHistory(prev => {
            const next = { ...prev };
            const now = Date.now();
            const oneHourAgo = now - 1 * 60 * 60 * 1000;

            metrics.forEach(m => {
                const podName = m.name;
                const key = `${selectedNamespace}/${podName}`;
                const currentMetric = getMetricForPod(metrics, podName);
                const cpuVal = parseInt(currentMetric.cpu) || 0;
                const memVal = parseInt(currentMetric.memory) || 0;

                if (!next[key]) {
                    next[key] = { cpu: [], memory: [], timestamps: [] };
                }

                next[key].cpu.push(cpuVal);
                next[key].memory.push(memVal);
                next[key].timestamps.push(now);
            });

            // Prune data older than 1 hour across ALL keys
            for (const key of Object.keys(next)) {
                const timestamps = next[key].timestamps;
                let pruneIndex = 0;
                while (pruneIndex < timestamps.length && timestamps[pruneIndex] < oneHourAgo) {
                    pruneIndex++;
                }
                if (pruneIndex > 0) {
                    next[key].cpu = next[key].cpu.slice(pruneIndex);
                    next[key].memory = next[key].memory.slice(pruneIndex);
                    next[key].timestamps = next[key].timestamps.slice(pruneIndex);
                }
                if (next[key].timestamps.length === 0) {
                    delete next[key];
                }
            }

            try {
                localStorage.setItem('kubiq_k8s_metrics_history', JSON.stringify(next));
            } catch (err) {
                console.warn('LocalStorage quota exceeded, clearing old keys:', err);
                localStorage.removeItem('kubiq_k8s_metrics_history');
            }
            return next;
        });
    }, [metrics, selectedNamespace]);
    
    // Auto-refresh timer state
    const [countdown, setCountdown] = useState(30);

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedItem, setSelectedItem] = useState<{type: string, data: any} | null>(null);

    // Sidebar state
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
        workloads: true, network: true, storage: false, config: false
    });

    const toggleGroup = (id: string) => setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));

    // Namespace dropdown state
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

    const fetchData = async () => {
        if (!available || !selectedNamespace && activeResource !== 'nodes' && activeResource !== 'persistentvolumes' && activeResource !== 'storageclasses') return;
        setLoading(true);
        try {
            switch(activeResource) {
                case 'overview': {
                    const [p, d, s, cm, sec, ev, m] = await Promise.all([
                        apiClient.getKubernetesPods(selectedNamespace),
                        apiClient.getKubernetesDeployments(selectedNamespace),
                        apiClient.getKubernetesServices(selectedNamespace),
                        apiClient.getKubernetesConfigMaps(selectedNamespace).catch(() => []),
                        apiClient.getKubernetesSecrets(selectedNamespace).catch(() => []),
                        apiClient.getKubernetesEvents(selectedNamespace),
                        apiClient.getKubernetesMetrics(selectedNamespace).catch(() => [])
                    ]);
                    setOverviewData({
                        pods: p,
                        deployments: d,
                        services: s,
                        configMaps: cm,
                        secrets: sec,
                        events: ev,
                        metrics: m
                    });
                    setResourceData(ev);
                    break;
                }
                case 'topology': {
                    const [p, s, ing, cm, sec] = await Promise.all([
                        apiClient.getKubernetesPods(selectedNamespace).catch(() => []),
                        apiClient.getKubernetesServices(selectedNamespace).catch(() => []),
                        apiClient.getKubernetesIngresses(selectedNamespace).catch(() => []),
                        apiClient.getKubernetesConfigMaps(selectedNamespace).catch(() => []),
                        apiClient.getKubernetesSecrets(selectedNamespace).catch(() => []),
                    ]);
                    setOverviewData({
                        pods: p,
                        services: s,
                        ingresses: ing,
                        configMaps: cm,
                        secrets: sec,
                    });
                    setResourceData([]);
                    break;
                }
                case 'pods': {
                    const [p, m] = await Promise.all([
                        apiClient.getKubernetesPods(selectedNamespace),
                        apiClient.getKubernetesMetrics(selectedNamespace)
                    ]);
                    setResourceData(p); setMetrics(m); break;
                }
                case 'deployments': setResourceData(await apiClient.getKubernetesDeployments(selectedNamespace)); break;
                case 'events': setResourceData(await apiClient.getKubernetesEvents(selectedNamespace)); break;
                case 'nodes': setResourceData(await apiClient.getKubernetesNodes()); break;
                case 'services': setResourceData(await apiClient.getKubernetesServices(selectedNamespace)); break;
                case 'endpoints': setResourceData(await apiClient.getKubernetesEndpoints(selectedNamespace)); break;
                case 'ingresses': setResourceData(await apiClient.getKubernetesIngresses(selectedNamespace)); break;
                case 'persistentvolumes': setResourceData(await apiClient.getKubernetesPersistentVolumes()); break;
                case 'persistentvolumeclaims': setResourceData(await apiClient.getKubernetesPersistentVolumeClaims(selectedNamespace)); break;
                case 'storageclasses': setResourceData(await apiClient.getKubernetesStorageClasses()); break;
                case 'configmaps': setResourceData(await apiClient.getKubernetesConfigMaps(selectedNamespace)); break;
                case 'secrets': setResourceData(await apiClient.getKubernetesSecrets(selectedNamespace)); break;
            }
            setCountdown(30);
        } catch (e) {
            console.error('Error fetching data:', e);
        } finally {
            setLoading(false);
        }
    };

    // Refetch when category or namespace changes
    useEffect(() => { fetchData(); }, [activeResource, selectedNamespace, available]);

    // Auto-refresh tick
    useEffect(() => {
        if (!available || loading) return;
        const timer = setInterval(() => {
            setCountdown(c => {
                if (c <= 1) { fetchData(); return 30; }
                return c - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [available, loading, activeResource, selectedNamespace]);


    // Sorting and Filtering
    const [sortCol, setSortCol] = useState<{key: string, asc: boolean} | null>(null);

    const handleSort = (key: string) => {
        setSortCol(prev => prev?.key === key ? { key, asc: !prev.asc } : { key, asc: true });
    };

    const filteredAndSortedData = useMemo(() => {
        let d = [...resourceData];
        // Filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            d = d.filter(item => {
                const name = item.name || item.metadata?.name || '';
                return name.toLowerCase().includes(q);
            });
        }
        // Sort
        if (sortCol) {
            d.sort((a, b) => {
                let va, vb;
                if (activeResource === 'pods') {
                    if (sortCol.key === 'restarts') { va = a.restarts; vb = b.restarts; }
                    else if (sortCol.key === 'age') { va = new Date(a.startTime).getTime(); vb = new Date(b.startTime).getTime(); }
                    else { va = a.name; vb = b.name; }
                } else {
                    va = a.metadata?.name || a.name || '';
                    vb = b.metadata?.name || b.name || '';
                }
                if (va < vb) return sortCol.asc ? -1 : 1;
                if (va > vb) return sortCol.asc ? 1 : -1;
                return 0;
            });
        }
        return d;
    }, [resourceData, searchQuery, sortCol, activeResource]);


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
            <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-[#0a0a0a]">
                <div className="absolute top-0 w-full h-96 bg-gradient-to-b from-primary/5 to-transparent" />
            </div>

            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 shrink-0 border-b border-gray-800 pb-6">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
                        <Network className="w-7 h-7 text-primary" /> Kubernetes Explorer
                    </h1>
                    <p className="text-gray-400 mt-1 text-sm">
                        {available
                            ? <>Connected to <code className="text-primary text-xs bg-primary/10 px-1.5 py-0.5 rounded ml-1">{context}</code></>
                            : 'Cluster not reachable'
                        }
                    </p>
                </div>

                {available && (
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Auto refresh indicator */}
                        <div className="text-xs text-gray-500 flex items-center gap-2 mr-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            Refreshes in {countdown}s
                        </div>

                        {/* Context Dropdown */}
                        {contexts.length > 0 && (
                            <div className="relative">
                                <button
                                    ref={ctxTriggerRef}
                                    type="button"
                                    onClick={() => {
                                        if (!isCtxOpen && ctxTriggerRef.current) {
                                            const r = ctxTriggerRef.current.getBoundingClientRect();
                                            setCtxRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 240) });
                                        }
                                        setIsCtxOpen(o => !o);
                                        setHoveredCtx(null);
                                    }}
                                    onMouseEnter={() => { if (!isCtxOpen) setHoveredCtx(context); }}
                                    onMouseLeave={() => setHoveredCtx(null)}
                                    className="bg-[#1a1a1a] border border-gray-700 hover:border-primary/50 text-gray-300 text-sm rounded-lg flex items-center justify-between gap-2 px-3 py-2 transition-colors focus:outline-none w-[240px]"
                                >
                                    <Server className="w-4 h-4 text-gray-400 shrink-0" />
                                    <span className="flex-1 text-left truncate w-[170px] font-mono text-xs font-semibold">{formatContextName(context) || 'Select context'}</span>
                                    <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isCtxOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {/* Trigger-Only Tooltip (Shown below the button only when dropdown is closed) */}
                                {hoveredCtx && !isCtxOpen && (
                                    <div 
                                        className="absolute right-0 top-full mt-2 bg-[#121212]/95 border border-gray-800 rounded-xl p-4 shadow-2xl z-[10000] backdrop-blur-md min-w-[320px] pointer-events-none transition-all animate-fade-in"
                                        style={{ boxShadow: '0 20px 40px -5px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.05)' }}
                                    >
                                        <div className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                            Connection Details
                                        </div>
                                        <div className="space-y-2.5 font-mono text-[11px] text-gray-300">
                                            <div>
                                                <div className="text-[9px] text-gray-500 uppercase font-bold mb-0.5">Provider</div>
                                                <div className="text-white font-medium text-xs">{getClusterProvider(hoveredCtx)}</div>
                                            </div>
                                            <div>
                                                <div className="text-[9px] text-gray-500 uppercase font-bold mb-0.5">Raw Context Identifier</div>
                                                <div className="text-white break-all bg-black/45 p-2 rounded-lg border border-white/[0.04] text-[10px] leading-relaxed">
                                                    {hoveredCtx}
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-gray-900">
                                                <div>
                                                    <div className="text-[9px] text-gray-500 uppercase font-bold mb-0.5">Cluster Target</div>
                                                    <div className="text-gray-200 truncate">
                                                        {contexts.find(c => c.name === hoveredCtx)?.cluster || '—'}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-[9px] text-gray-500 uppercase font-bold mb-0.5">Auth User</div>
                                                    <div className="text-gray-200 truncate">
                                                        {contexts.find(c => c.name === hoveredCtx)?.user || '—'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Portal-Docked Option Tooltip (Shown to the left of the list when dropdown is open) */}
                                {isCtxOpen && hoveredCtx && ctxRect && createPortal(
                                    <div 
                                        className="fixed bg-[#121212]/95 border border-gray-800 rounded-xl p-4 shadow-2xl z-[10000] backdrop-blur-md w-[320px] pointer-events-none transition-all animate-fade-in"
                                        style={{ 
                                            top: ctxRect.top, 
                                            left: ctxRect.left - 330, 
                                            boxShadow: '0 20px 40px -5px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.05)' 
                                        }}
                                    >
                                        <div className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                            Connection Details
                                        </div>
                                        <div className="space-y-2.5 font-mono text-[11px] text-gray-300">
                                            <div>
                                                <div className="text-[9px] text-gray-500 uppercase font-bold mb-0.5">Provider</div>
                                                <div className="text-white font-medium text-xs">{getClusterProvider(hoveredCtx)}</div>
                                            </div>
                                            <div>
                                                <div className="text-[9px] text-gray-500 uppercase font-bold mb-0.5">Raw Context Identifier</div>
                                                <div className="text-white break-all bg-black/45 p-2 rounded-lg border border-white/[0.04] text-[10px] leading-relaxed">
                                                    {hoveredCtx}
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-gray-900">
                                                <div>
                                                    <div className="text-[9px] text-gray-500 uppercase font-bold mb-0.5">Cluster Target</div>
                                                    <div className="text-gray-200 truncate">
                                                        {contexts.find(c => c.name === hoveredCtx)?.cluster || '—'}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-[9px] text-gray-500 uppercase font-bold mb-0.5">Auth User</div>
                                                    <div className="text-gray-200 truncate">
                                                        {contexts.find(c => c.name === hoveredCtx)?.user || '—'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>,
                                    document.body
                                )}

                                {isCtxOpen && ctxRect && createPortal(
                                    <div
                                        ref={ctxPanelRef}
                                        style={{ position: 'fixed', top: ctxRect.top, left: ctxRect.left, width: ctxRect.width, zIndex: 9999 }}
                                        className="bg-[#1e1e1e] border border-gray-700 rounded-xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto custom-scrollbar animate-fade-in"
                                    >
                                        <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 border-b border-gray-800 uppercase tracking-wider bg-[#151515]">
                                            Available Contexts
                                        </div>
                                        {contexts.map(ctx => (
                                            <button
                                                key={ctx.name}
                                                type="button"
                                                onClick={() => { switchContext(ctx.name); setIsCtxOpen(false); }}
                                                onMouseEnter={() => setHoveredCtx(ctx.name)}
                                                onMouseLeave={() => setHoveredCtx(null)}
                                                className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-primary/20 flex flex-col items-start gap-1 border-b border-gray-800/40 last:border-0 ${context === ctx.name ? 'text-primary font-medium bg-primary/5' : 'text-gray-300'}`}
                                            >
                                                <div className="flex items-center gap-2 w-full min-w-0">
                                                    <Server className="w-3.5 h-3.5 opacity-60 shrink-0 text-primary" />
                                                    <span className="truncate block font-mono text-xs font-semibold">{formatContextName(ctx.name)}</span>
                                                </div>
                                                <span className="text-[9px] text-gray-500 ml-5.5 truncate w-[90%] block font-mono">
                                                    Provider: {getClusterProvider(ctx.name).replace(' Elastic Kubernetes Service', ' EKS').replace(' Kubernetes Engine', ' GKE')}
                                                </span>
                                            </button>
                                        ))}
                                    </div>,
                                    document.body
                                )}
                            </div>
                        )}

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
                                className="bg-[#1a1a1a] border border-gray-700 hover:border-primary/50 text-gray-300 text-sm rounded-lg flex items-center justify-between gap-2 px-3 py-2 transition-colors focus:outline-none min-w-[160px]"
                            >
                                <Layers className="w-4 h-4 text-gray-400 shrink-0" />
                                <span className="flex-1 text-left">{selectedNamespace || 'Select namespace'}</span>
                                <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isNsOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isNsOpen && nsRect && createPortal(
                                <div
                                    ref={nsPanelRef}
                                    style={{ position: 'fixed', top: nsRect.top, left: nsRect.left, width: nsRect.width, zIndex: 9999 }}
                                    className="bg-[#1e1e1e] border border-gray-700 rounded-xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto custom-scrollbar"
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
                            onClick={() => fetchData()}
                            disabled={loading}
                            className="bg-[#1a1a1a] border border-gray-700 hover:border-primary/50 text-gray-300 text-sm rounded-lg flex items-center gap-2 px-3 py-2 transition-colors"
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
                <div className="flex flex-1 overflow-hidden gap-6">
                    {/* ── LEFT SIDEBAR TREE ── */}
                    <div className="w-64 shrink-0 flex flex-col overflow-y-auto custom-scrollbar pr-2">
                        {SIDEBAR_MENU.map(item => (
                            <div key={item.id} className="mb-1">
                                {item.children ? (
                                    <>
                                        <button 
                                            onClick={() => toggleGroup(item.id)}
                                            className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors group"
                                        >
                                            <div className="flex items-center gap-2">
                                                <item.icon className="w-4 h-4 opacity-70 group-hover:opacity-100" />
                                                <span className="font-medium tracking-wide">{item.label}</span>
                                            </div>
                                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedGroups[item.id] ? '' : '-rotate-90'}`} />
                                        </button>
                                        {expandedGroups[item.id] && (
                                            <div className="ml-5 border-l border-gray-800 pl-2 mt-1 space-y-0.5">
                                                {item.children.map(child => (
                                                    <button
                                                        key={child.id}
                                                        onClick={() => { setActiveResource(child.type); setSearchQuery(''); }}
                                                        className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors ${activeResource === child.type ? 'bg-primary/10 text-primary font-medium' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
                                                    >
                                                        {child.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <button
                                        onClick={() => { setActiveResource(item.type); setSearchQuery(''); }}
                                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${activeResource === item.type ? 'bg-primary/10 text-primary font-medium' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                                    >
                                        <item.icon className={`w-4 h-4 ${activeResource === item.type ? 'opacity-100' : 'opacity-70'}`} />
                                        <span className="font-medium tracking-wide">{item.label}</span>
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* ── RIGHT CONTENT PANEL ── */}
                    <div className="flex-1 bg-[#141414] border border-gray-800 rounded-xl overflow-hidden flex flex-col relative shadow-xl">
                        {loading && (
                            <div className="absolute top-0 left-0 w-full h-0.5 bg-gray-800 overflow-hidden z-20">
                                <div className="h-full bg-primary w-1/3 animate-[slide-right_1s_ease-in-out_infinite]" />
                            </div>
                        )}

                        {activeResource === 'overview' ? (
                            <K8sNamespaceOverview 
                                data={overviewData} 
                                onSwitchTab={(tab) => { setActiveResource(tab); setSearchQuery(''); }}
                                onSelectItem={setSelectedItem}
                            />
                        ) : activeResource === 'topology' ? (
                            <K8sRelationshipMap
                                namespace={selectedNamespace}
                                pods={overviewData?.pods || []}
                                services={overviewData?.services || []}
                                ingresses={overviewData?.ingresses || []}
                                configMaps={overviewData?.configMaps || []}
                                secrets={overviewData?.secrets || []}
                                onSelectItem={setSelectedItem}
                            />
                        ) : (
                            <>
                                {/* Toolbar */}
                                <div className="p-3 border-b border-gray-800 flex items-center justify-between bg-[#1a1a1a]">
                                    <div className="flex items-center gap-2 px-2">
                                        <span className="text-sm font-semibold text-white capitalize">{activeResource.replace('persistent', 'Persistent ')}</span>
                                        <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{filteredAndSortedData.length}</span>
                                    </div>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                                        <input 
                                            type="text" 
                                            placeholder="Search name..."
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            className="bg-[#111111] border border-gray-700 text-sm text-white rounded-md pl-9 pr-4 py-1.5 focus:outline-none focus:border-primary/50 w-56 transition-all"
                                        />
                                        {searchQuery && (
                                            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Dynamic Table View */}
                                <div className="flex-1 overflow-auto custom-scrollbar">
                                    <table className="w-full text-sm">
                                        <thead className="bg-[#1a1a1a] sticky top-0 z-10 shadow-sm">
                                            <tr className="text-xs text-gray-400 border-b border-gray-800">
                                                <th className="text-left px-4 py-3 font-medium cursor-pointer hover:text-white" onClick={() => handleSort('name')}>
                                                    Name {sortCol?.key === 'name' && (sortCol.asc ? '↑' : '↓')}
                                                </th>
                                                
                                                {/* Dynamic columns based on type */}
                                                {activeResource === 'pods' && (
                                                    <>
                                                        <th className="text-left px-4 py-3 font-medium">Ready</th>
                                                        <th className="text-left px-4 py-3 font-medium">Status</th>
                                                        <th className="text-center px-4 py-3 font-medium">CPU</th>
                                                        <th className="text-center px-4 py-3 font-medium">RAM</th>
                                                        <th className="text-center px-4 py-3 font-medium cursor-pointer hover:text-white" onClick={() => handleSort('restarts')}>
                                                            Restarts {sortCol?.key === 'restarts' && (sortCol.asc ? '↑' : '↓')}
                                                        </th>
                                                        <th className="text-center px-4 py-3 font-medium cursor-pointer hover:text-white" onClick={() => handleSort('age')}>
                                                            Age {sortCol?.key === 'age' && (sortCol.asc ? '↑' : '↓')}
                                                        </th>
                                                    </>
                                                )}
                                                {activeResource === 'deployments' && (
                                                    <>
                                                        <th className="text-center px-4 py-3 font-medium">Desired</th>
                                                        <th className="text-center px-4 py-3 font-medium">Ready</th>
                                                        <th className="text-left px-4 py-3 font-medium">Status</th>
                                                    </>
                                                )}
                                                {['services', 'endpoints', 'ingresses', 'configmaps', 'secrets', 'nodes'].includes(activeResource) && (
                                                    <th className="text-right px-4 py-3 font-medium">Creation Time</th>
                                                )}
                                                <th className="w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-800/40">
                                            {filteredAndSortedData.length === 0 ? (
                                                <tr><td colSpan={10} className="p-8 text-center text-gray-500">No {activeResource} found</td></tr>
                                            ) : filteredAndSortedData.map((item, idx) => {
                                                const name = item.name || item.metadata?.name;
                                                const cTime = item.startTime || item.metadata?.creationTimestamp;

                                                return (
                                                    <tr key={`${name}-${idx}`} className="hover:bg-white/[0.04] transition-colors cursor-pointer group" onClick={() => setSelectedItem({type: activeResource, data: item})}>
                                                        <td className="px-4 py-2.5">
                                                            <div className="flex items-center gap-2">
                                                                <FileJson className="w-3.5 h-3.5 text-gray-500 group-hover:text-primary transition-colors" />
                                                                <span className="font-mono text-xs text-gray-200">{name}</span>
                                                            </div>
                                                        </td>

                                                        {/* Pods Specific */}
                                                        {activeResource === 'pods' && (
                                                            <>
                                                                <td className="px-4 py-2.5 font-mono text-[11px] text-gray-400">
                                                                    {item.readyCount}/{item.totalContainers}
                                                                </td>
                                                                <td className="px-4 py-2.5"><K8sPodStatusBadge status={item.status} isTerminating={item.isTerminating} /></td>
                                                                <td className="px-4 py-2.5">
                                                                    <div className="flex items-center justify-center gap-2">
                                                                        <span className="font-mono text-xs text-yellow-400/80 min-w-[40px] text-right">
                                                                            {parseCpu(getMetricForPod(metrics, name).cpu)}
                                                                        </span>
                                                                        {metricsHistory[`${selectedNamespace}/${name}`]?.cpu ? (
                                                                            <K8sMiniSparkline data={metricsHistory[`${selectedNamespace}/${name}`].cpu.slice(-15)} color="#eab308" />
                                                                        ) : (
                                                                            <div className="w-12 h-1 bg-yellow-500/10 rounded overflow-hidden relative shrink-0">
                                                                                <div className="absolute inset-0 bg-yellow-500/30 animate-pulse" />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-2.5">
                                                                    <div className="flex items-center justify-center gap-2">
                                                                        <span className="font-mono text-xs text-blue-400/80 min-w-[50px] text-right">
                                                                            {parseMemory(getMetricForPod(metrics, name).memory)}
                                                                        </span>
                                                                        {metricsHistory[`${selectedNamespace}/${name}`]?.memory ? (
                                                                            <K8sMiniSparkline data={metricsHistory[`${selectedNamespace}/${name}`].memory.slice(-15)} color="#d946ef" />
                                                                        ) : (
                                                                            <div className="w-12 h-1 bg-fuchsia-500/10 rounded overflow-hidden relative shrink-0">
                                                                                <div className="absolute inset-0 bg-fuchsia-500/30 animate-pulse" />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-2.5 text-center text-xs font-medium text-gray-400">{item.restarts}</td>
                                                                <td className="px-4 py-2.5 text-center text-xs text-gray-500">{timeAgo(cTime)}</td>
                                                            </>
                                                        )}

                                                        {/* Deployments Specific */}
                                                        {activeResource === 'deployments' && (
                                                            <>
                                                                <td className="px-4 py-2.5 text-center text-gray-400 text-xs">{item.replicas}</td>
                                                                <td className="px-4 py-2.5 text-center text-xs font-medium">
                                                                    <span className={item.readyReplicas >= item.replicas ? 'text-green-400' : 'text-red-400'}>{item.readyReplicas}/{item.replicas}</span>
                                                                </td>
                                                                <td className="px-4 py-2.5 text-xs">
                                                                    {item.readyReplicas >= item.replicas 
                                                                        ? <span className="text-green-400">Healthy</span> 
                                                                        : <span className="text-red-400">Degraded</span>}
                                                                </td>
                                                            </>
                                                        )}

                                                        {/* Generic Timestamp for Others */}
                                                        {['services', 'endpoints', 'ingresses', 'configmaps', 'secrets', 'nodes'].includes(activeResource) && (
                                                            <td className="px-4 py-2.5 text-right text-xs text-gray-500">
                                                                {cTime ? new Date(cTime).toLocaleString() : '—'}
                                                            </td>
                                                        )}

                                                        <td className="px-4 py-2.5 text-right text-gray-500">
                                                            <ChevronDown className="w-4 h-4 -rotate-90 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
            
            {/* Detail Panel Modal */}
            {selectedItem && (
                <K8sDetailPanel 
                    item={selectedItem} 
                    onClose={() => setSelectedItem(null)} 
                    namespace={selectedNamespace}
                    onScale={scaleDeployment}
                    onRestart={restartDeployment}
                    onDelete={deleteResource}
                    onApplyManifest={apiClient.applyKubernetesManifest.bind(apiClient)}
                    metricsHistory={metricsHistory}
                />
            )}
        </div>
    );
}
