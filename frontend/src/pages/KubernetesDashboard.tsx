import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    RefreshCw, ChevronDown, AlertTriangle,
    Box, Layers, Activity, Network,
    Search, X, Server, Database, Globe, FileJson, Settings
} from 'lucide-react';
import { useKubernetes, KubeMetric } from '../hooks/useKubernetes';
import { apiClient } from '../services/api';
import { K8sLogViewer } from '../components/K8sLogViewer';

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

function PodStatusBadge({ status }: { status: string }) {
    let color = 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    let label = status;

    const s = (status || '').toLowerCase();
    if (s.includes('running') || s.includes('completed')) {
        color = 'bg-green-500/10 text-green-400 border-green-500/20';
    } else if (s.includes('pending') || s.includes('containercreating') || s.includes('podinitializing')) {
        color = 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
    } else if (s.includes('error') || s.includes('fail') || s.includes('crash') || s.includes('backoff') || s.includes('imagepull') || s.includes('evicted')) {
        color = 'bg-red-500/10 text-red-400 border-red-500/20';
    }

    return (
        <div className={`px-2 py-0.5 rounded-full border text-[10px] font-medium inline-flex items-center gap-1.5 ${color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.includes('running') ? 'animate-pulse bg-green-400' : 'bg-current'}`} />
            {label}
        </div>
    );
}

// ── Slide-over Detail & YAML Panel ────────────────────────────────────────────

function DetailPanel({ item, onClose, namespace }: { item: any, onClose: () => void, namespace: string }) {
    const [yaml, setYaml] = useState<string>('');
    const [loadingYaml, setLoadingYaml] = useState(false);
    const [activeTab, setActiveTab] = useState<'details' | 'yaml' | 'logs'>('details');
    const canShowLogs = item?.type === 'pods' || item?.type === 'deployments';

    useEffect(() => {
        if (item && item.type) {
            setLoadingYaml(true);
            const isClusterScoped = ['nodes', 'persistentvolumes', 'storageclasses'].includes(item.type);
            const resourceName = item.data.name || item.data.metadata?.name;
            const resourceNs = isClusterScoped ? '-' : (item.data.namespace || item.data.metadata?.namespace || namespace);
            
            if (!resourceName) {
                setYaml('Error: Could not determine resource name');
                setLoadingYaml(false);
                return;
            }

            apiClient.getKubernetesResourceYaml(resourceNs, item.type, resourceName)
                .then(data => {
                    setYaml(JSON.stringify(data, null, 2));
                })
                .catch(err => {
                    setYaml(`Error loading YAML: ${err.message}`);
                })
                .finally(() => setLoadingYaml(false));
        }
    }, [item, namespace]);

    // Keyboard shortcut to close
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    if (!item) return null;

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        // Could add a toast notification here
    };

    const resName = item.data.name || item.data.metadata?.name;
    const resNs = item.data.namespace || item.data.metadata?.namespace || (item.type === 'events' ? namespace : null);
    const resStartTime = item.data.startTime || item.data.metadata?.creationTimestamp || item.data.lastTimestamp;
    const resNode = item.data.nodeName || item.data.spec?.nodeName;
    const resLabels = item.data.labels || item.data.metadata?.labels || {};

    return createPortal(
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={onClose} />
            <div className="relative w-full max-w-2xl bg-[#111111] border-l border-gray-800 shadow-2xl flex flex-col h-full overflow-hidden animate-slide-in-right">
                <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-[#1a1a1a]">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <FileJson className="w-5 h-5 text-primary shrink-0" />
                        <h2 className="text-lg font-semibold text-white truncate" title={resName}>
                            {resName}
                        </h2>
                        <span className="text-xs bg-white/10 text-gray-400 px-2 py-0.5 rounded capitalize shrink-0">{item.type}</span>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors shrink-0">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="flex border-b border-gray-800 bg-[#1a1a1a] px-4 pt-2">
                    <button onClick={() => setActiveTab('details')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'details' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>Overview</button>
                    <button onClick={() => setActiveTab('yaml')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'yaml' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>JSON / YAML</button>
                    {canShowLogs && (
                        <button onClick={() => setActiveTab('logs')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'logs' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>
                            Logs
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto bg-[#111111] min-h-0">
                    {activeTab === 'logs' && canShowLogs ? (
                        <K8sLogViewer
                            namespace={item.data.namespace || item.data.metadata?.namespace || namespace}
                            podName={item.type === 'pods' ? (item.data.name || item.data.metadata?.name) : undefined}
                            deploymentName={item.type === 'deployments' ? (item.data.name || item.data.metadata?.name) : undefined}
                            containers={
                                item.data.containers || 
                                item.data.spec?.containers || 
                                item.data.spec?.template?.spec?.containers || 
                                [{ name: 'main', image: '' }]
                            }
                        />
                    ) : activeTab === 'yaml' ? (
                        <div className="p-4 h-full flex flex-col">
                            {loadingYaml ? (
                                <div className="flex-1 flex justify-center items-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
                            ) : (
                                <div className="relative flex-1 group">
                                    <button onClick={() => copyToClipboard(yaml)} className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-gray-300 text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">Copy</button>
                                    <pre className="text-xs font-mono text-gray-300 bg-[#1a1a1a] p-4 rounded-lg overflow-auto border border-gray-800 h-full">
                                        {yaml}
                                    </pre>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="p-6 space-y-6">
                            {/* Generic Metadata */}
                            <div className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800 shadow-inner">
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex justify-between">
                                    <span>Metadata</span>
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    {resNs && <div><span className="text-gray-500 text-xs block">Namespace</span><span className="text-sm font-mono text-gray-200">{resNs}</span></div>}
                                    {resStartTime && <div><span className="text-gray-500 text-xs block">Last Active</span><span className="text-sm text-gray-200">{new Date(resStartTime).toLocaleString()}</span></div>}
                                    {resNode && <div><span className="text-gray-500 text-xs block">Node</span><span className="text-sm font-mono text-primary cursor-pointer hover:underline" onClick={() => copyToClipboard(resNode)}>{resNode}</span></div>}
                                    {item.data.podIP && <div><span className="text-gray-500 text-xs block">IP Address</span><span className="text-sm font-mono text-gray-200">{item.data.podIP}</span></div>}
                                </div>
                                {resLabels && Object.keys(resLabels).length > 0 && (
                                    <div className="mt-4">
                                        <span className="text-gray-500 text-xs block mb-2">Labels</span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {Object.entries(resLabels).map(([k, v]) => (
                                                <span key={k} className="text-[10px] font-mono bg-white/5 border border-white/10 text-gray-300 px-2 py-1 rounded">
                                                    <span className="text-gray-500">{k}:</span> {v as string}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Event Specific Details */}
                            {item.type === 'events' && (
                                <div className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800 border-l-4 border-l-yellow-500/50">
                                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Event Details</h3>
                                    <div className="space-y-4">
                                        <div className="flex items-start gap-4">
                                            <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${item.data.type === 'Warning' ? 'bg-yellow-500' : 'bg-blue-500'}`} />
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm text-white font-medium mb-1">{item.data.reason}</div>
                                                <div className="text-xs text-gray-400 leading-relaxed bg-black/20 p-2 rounded break-all whitespace-pre-wrap">{item.data.message}</div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-800/50">
                                            <div className="min-w-0 flex-1">
                                                <span className="text-gray-500 text-[10px] uppercase block">Involved Object</span>
                                                <span className="text-xs text-primary font-mono truncate block" title={`${item.data.involvedKind}: ${item.data.involvedObject}`}>{item.data.involvedKind}: {item.data.involvedObject}</span>
                                            </div>
                                            <div>
                                                <span className="text-gray-500 text-[10px] uppercase block">Occurrences</span>
                                                <span className="text-xs text-gray-300 font-mono">{item.data.count} times</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Pod Specific */}
                            {item.type === 'pods' && item.data.containers && (
                                <div>
                                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Containers</h3>
                                    <div className="space-y-3">
                                        {item.data.containers.map((c: any, i: number) => (
                                            <div key={i} className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-3">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="font-mono text-sm text-primary">{c.name}</span>
                                                    <span className={`text-xs px-2 py-0.5 rounded-full ${c.ready ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                                        {c.ready ? 'Ready' : 'Not Ready'}
                                                    </span>
                                                </div>
                                                <div className="text-[11px] text-gray-400 font-mono break-all mb-2 cursor-pointer hover:text-gray-200 transition-colors" onClick={() => copyToClipboard(c.image)} title="Click to copy image URL">{c.image}</div>
                                                <div className="flex gap-4 text-xs bg-black/20 p-2 rounded">
                                                    <span>State: <span className="text-white capitalize">{c.state}</span></span>
                                                    <span>Restarts: <span className={c.restartCount > 0 ? 'text-orange-400 font-bold' : 'text-gray-300'}>{c.restartCount}</span></span>
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
                                    <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg overflow-hidden">
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-black/20 text-gray-400">
                                                <tr><th className="px-3 py-2 font-medium">Type</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Reason</th></tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-800/50">
                                                {item.data.conditions.map((c: any, i: number) => (
                                                    <tr key={i}>
                                                        <td className="px-3 py-2 text-gray-200">{c.type}</td>
                                                        <td className="px-3 py-2">
                                                            <span className={c.status === 'True' ? 'text-green-400' : 'text-gray-500'}>{c.status}</span>
                                                        </td>
                                                        <td className="px-3 py-2 text-gray-400 truncate max-w-[200px]" title={c.message}>{c.reason !== '—' ? c.reason : c.message}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
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
                Deploy kubiq on the same VM where you run <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-sm">kubectl</code> commands to enable cluster inspection.
            </p>
        </div>
    );
}

// ── Sidebar Config ────────────────────────────────────────────────────────────

const SIDEBAR_MENU = [
    { id: 'overview', label: 'Overview', icon: Activity, type: 'overview' },
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
    const { available, context, namespaces, selectedNamespace, setSelectedNamespace } = useKubernetes();

    // Use our own state for all the resources
    const [activeResource, setActiveResource] = useState<string>('overview');
    const [resourceData, setResourceData] = useState<any[]>([]);
    const [metrics, setMetrics] = useState<KubeMetric[]>([]);
    const [loading, setLoading] = useState(false);
    
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
                    const [, ev] = await Promise.all([
                        apiClient.getKubernetesPods(selectedNamespace),
                        apiClient.getKubernetesEvents(selectedNamespace)
                    ]);
                    setResourceData(ev); // Pass events to overview via resourceData
                    // We only need pod counts for overview, which we can approximate or fetch specifically
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
                            <div className="p-6 overflow-y-auto custom-scrollbar">
                                <h2 className="text-xl font-bold text-white mb-6">Namespace Overview</h2>
                                {/* Show recent events in overview */}
                                <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl overflow-hidden">
                                        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                                                <h3 className="font-semibold text-gray-200">Recent Warning Events</h3>
                                            </div>
                                            <button onClick={() => setActiveResource('events')} className="text-xs text-primary hover:text-blue-300 transition-colors">View All →</button>
                                        </div>
                                        <div className="divide-y divide-gray-800/40">
                                            {resourceData.length === 0 ? (
                                                <div className="p-8 text-center text-gray-500">No warnings in this namespace!</div>
                                            ) : resourceData.slice(0, 5).map((ev, i) => (
                                                <div key={i} className="px-4 py-3 flex items-start gap-4 hover:bg-white/[0.02] cursor-pointer" onClick={() => setSelectedItem({type: 'events', data: ev})}>
                                                    <span className="text-xs font-semibold text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded shrink-0 mt-0.5">{ev.reason}</span>
                                                    <div className="flex-1">
                                                        <div className="text-sm text-gray-300">{ev.message}</div>
                                                        <div className="text-xs text-gray-500 mt-1">{ev.involvedKind}: {ev.involvedObject} • {timeAgo(ev.lastTimestamp)} ago</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                            </div>
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
                                                                <td className="px-4 py-2.5"><PodStatusBadge status={item.status} /></td>
                                                                <td className="px-4 py-2.5 text-center font-mono text-xs text-yellow-400/80">{parseCpu(getMetricForPod(metrics, name).cpu)}</td>
                                                                <td className="px-4 py-2.5 text-center font-mono text-xs text-blue-400/80">{parseMemory(getMetricForPod(metrics, name).memory)}</td>
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
            <DetailPanel item={selectedItem} onClose={() => setSelectedItem(null)} namespace={selectedNamespace} />
        </div>
    );
}
