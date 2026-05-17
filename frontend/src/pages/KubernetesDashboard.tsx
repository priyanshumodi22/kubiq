import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
    RefreshCw, ChevronDown, AlertTriangle,
    Box, Layers, Activity, Network,
    Search, X, Server, Database, Globe, FileJson, Settings,
    Trash2, Sliders, Plus, Minus, Copy, Save, Terminal
} from 'lucide-react';
import { Editor, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import yamlParser from 'js-yaml';

// Configure monaco to load from local node_modules instead of CDN
loader.config({ monaco });
import { useKubernetes, KubeMetric } from '../hooks/useKubernetes';
import { apiClient } from '../services/api';
import { useToast } from '../contexts/ToastContext';
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

export function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
        console.log('Copied to clipboard');
    });
}

function PodStatusBadge({ status, isTerminating }: { status: string, isTerminating?: boolean }) {
    let color = 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    let label = isTerminating ? 'Terminating' : status;

    const s = String(status || '').toLowerCase();
    
    if (isTerminating) {
        color = 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    } else if (s.includes('running') || s.includes('completed')) {
        color = 'bg-green-500/10 text-green-400 border-green-500/20';
    } else if (s.includes('pending') || s.includes('containercreating') || s.includes('podinitializing')) {
        color = 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
    } else if (s.includes('error') || s.includes('fail') || s.includes('crash') || s.includes('backoff') || s.includes('imagepull') || s.includes('evicted')) {
        color = 'bg-red-500/10 text-red-400 border-red-500/20';
    }

    const isRunning = s.includes('running') && !isTerminating;

    return (
        <div className={`px-2 py-0.5 rounded-full border text-[10px] font-medium inline-flex items-center gap-1.5 ${color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'animate-pulse bg-green-400' : isTerminating ? 'animate-pulse bg-orange-400' : 'bg-current'}`} />
            {label}
        </div>
    );
}

interface MiniSparklineProps {
    data: number[];
    color: string;
}

function MiniSparkline({ data, color }: MiniSparklineProps) {
    const chartData = data.map((val, idx) => ({ id: idx, value: val }));
    while (chartData.length < 5) {
        chartData.unshift({ id: -chartData.length, value: 0 });
    }
    return (
        <div className="w-12 h-5 opacity-80 hover:opacity-100 transition-opacity shrink-0">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
                    <defs>
                        <linearGradient id={`color-${color}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.4}/>
                            <stop offset="95%" stopColor={color} stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <Area 
                        type="monotone" 
                        dataKey="value" 
                        stroke={color} 
                        fill={`url(#color-${color})`} 
                        strokeWidth={1.2} 
                        dot={false}
                        isAnimationActive={false}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

// ── Components ────────────────────────────────────────────────────────────────

function ConfirmModal({ 
    isOpen, 
    onClose, 
    onConfirm, 
    title, 
    message, 
    confirmText = 'Confirm',
    variant = 'primary'
}: { 
    isOpen: boolean, 
    onClose: () => void, 
    onConfirm: () => void, 
    title: string, 
    message: string,
    confirmText?: string,
    variant?: 'primary' | 'danger' | 'warning'
}) {
    if (!isOpen) return null;

    const variantStyles = {
        primary: 'bg-primary text-black hover:bg-primary-hover',
        danger: 'bg-red-500 text-white hover:bg-red-600',
        warning: 'bg-yellow-500 text-black hover:bg-yellow-600'
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
            <div className="relative w-full max-w-md bg-[#1a1a1a] border border-gray-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                <div className="p-6">
                    <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">{message}</p>
                </div>
                <div className="flex items-center justify-end gap-3 p-4 bg-black/20 border-t border-gray-800">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors">Cancel</button>
                    <button onClick={onConfirm} className={`px-5 py-2 text-sm font-bold rounded-xl transition-all ${variantStyles[variant]}`}>{confirmText}</button>
                </div>
            </div>
        </div>,
        document.body
    );
}

const QuickActions = ({ 
    item,
    resName,
    onClose,
    onScale, 
    onRestart, 
    onDelete 
}: { 
    item: any,
    resName: string,
    onClose: () => void,
    onScale: (name: string, replicas: number) => Promise<void>,
    onRestart: (name: string) => Promise<void>,
    onDelete: (type: string, name: string) => Promise<void>
}) => {
    // Hide management for non-manageable resources
    const nonManageable = ['nodes', 'events', 'storageclasses', 'namespaces'];
    if (nonManageable.includes(item.type?.toLowerCase())) return null;

    const [isScaling, setIsScaling] = useState(false);
    const [replicas, setReplicas] = useState(item.data.totalContainers || item.data.replicas || 0);
    const [actionLoading, setActionLoading] = useState(false);
    const [confirmState, setConfirmState] = useState<{ type: 'restart' | 'delete' | null, open: boolean }>({ type: null, open: false });

    const handleRestart = async () => {
        setActionLoading(true);
        try {
            await onRestart(resName);
            onClose();
        } finally { 
            setActionLoading(false);
            setConfirmState({ type: null, open: false });
        }
    };

    const handleDelete = async () => {
        setActionLoading(true);
        try {
            await onDelete(item.type, resName);
            onClose();
        } finally { 
            setActionLoading(false);
            setConfirmState({ type: null, open: false });
        }
    };

    const handleScale = async () => {
        setActionLoading(true);
        try {
            await onScale(resName, replicas);
            setIsScaling(false);
        } finally { setActionLoading(false); }
    };

    return (
        <div className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800 border-l-4 border-l-primary/50 shadow-lg">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                <Settings className="w-3 h-3" />
                Management Actions
            </h3>
            
            <div className="flex flex-wrap gap-2">
                {item.type === 'deployments' && (
                    <>
                        <button 
                            onClick={() => setIsScaling(!isScaling)}
                            className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg text-xs font-medium transition-all ${isScaling ? 'bg-primary text-black border-primary' : 'bg-primary/10 hover:bg-primary/20 text-primary border-primary/20'}`}
                        >
                            <Sliders className="w-3.5 h-3.5" />
                            Scale
                        </button>
                        <button 
                            onClick={() => setConfirmState({ type: 'restart', open: true })}
                            disabled={actionLoading}
                            className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/20 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                            Rolling Restart
                        </button>
                    </>
                )}
                
                <button 
                    onClick={() => setConfirmState({ type: 'delete', open: true })}
                    disabled={actionLoading}
                    className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-lg text-xs font-medium transition-all ml-auto disabled:opacity-50"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                </button>
            </div>

            {isScaling && (
                <div className="mt-4 p-3 bg-black/30 rounded-lg border border-gray-800 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-xs text-gray-400">Target Replicas:</span>
                        <div className="flex items-center gap-3">
                            <button onClick={() => setReplicas(Math.max(0, replicas - 1))} className="p-1 hover:bg-white/10 rounded border border-gray-700 text-gray-400"><Minus className="w-3 h-3" /></button>
                            <span className="font-mono text-lg text-white w-8 text-center">{replicas}</span>
                            <button onClick={() => setReplicas(replicas + 1)} className="p-1 hover:bg-white/10 rounded border border-gray-700 text-gray-400"><Plus className="w-3 h-3" /></button>
                        </div>
                        <button 
                            onClick={handleScale}
                            disabled={actionLoading}
                            className="px-4 py-1.5 bg-primary text-black rounded-lg text-xs font-bold hover:bg-primary-hover transition-colors disabled:opacity-50"
                        >
                            {actionLoading ? 'Applying...' : 'Apply'}
                        </button>
                    </div>
                </div>
            )}

            <ConfirmModal 
                isOpen={confirmState.open && confirmState.type === 'restart'}
                onClose={() => setConfirmState({ type: null, open: false })}
                onConfirm={handleRestart}
                title="Trigger Rolling Restart?"
                message={`This will cycle all pods in ${resName} one by one. There will be no downtime.`}
                confirmText="Restart Now"
                variant="warning"
            />

            <ConfirmModal 
                isOpen={confirmState.open && confirmState.type === 'delete'}
                onClose={() => setConfirmState({ type: null, open: false })}
                onConfirm={handleDelete}
                title={`Delete ${item.type}?`}
                message={`Are you sure you want to delete "${resName}"? This action cannot be undone and may disrupt services.`}
                confirmText="Delete Forever"
                variant="danger"
            />
        </div>
    );
};

function DetailPanel({ 
    item, 
    onClose, 
    namespace,
    onScale,
    onRestart,
    onDelete,
    onApplyManifest,
    metricsHistory = {}
}: { 
    item: any, 
    onClose: () => void, 
    namespace: string,
    onScale: (name: string, replicas: number) => Promise<void>,
    onRestart: (name: string) => Promise<void>,
    onDelete: (type: string, name: string) => Promise<void>,
    onApplyManifest: (manifest: string) => Promise<void>,
    metricsHistory?: Record<string, { cpu: number[], memory: number[], timestamps?: number[] }>
}) {

    const [yaml, setYaml] = useState<string>('');
    const [loadingYaml, setLoadingYaml] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedYaml, setEditedYaml] = useState<string>('');
    const [applyingYaml, setApplyingYaml] = useState(false);
    const [activeTab, setActiveTab] = useState<'details' | 'yaml' | 'logs'>('details');
    const { addToast } = useToast() as any;
    const canShowLogs = item?.type === 'pods' || item?.type === 'deployments';

    const [mountChart, setMountChart] = useState(false);
    useEffect(() => {
        setMountChart(false);
        const timer = setTimeout(() => setMountChart(true), 400);
        return () => clearTimeout(timer);
    }, [item]);

    useEffect(() => {
        if (item && item.type && activeTab === 'yaml') {
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
                    const y = yamlParser.dump(data, { indent: 2, noRefs: true });
                    setYaml(y);
                    setEditedYaml(y);
                })
                .catch(err => {
                    setYaml(`Error loading YAML: ${err.message}`);
                })
                .finally(() => setLoadingYaml(false));
        }
    }, [item, namespace, activeTab]);

    const handleApply = async () => {
        setApplyingYaml(true);
        try {
            await onApplyManifest(editedYaml);
            setYaml(editedYaml);
            setIsEditing(false);
            addToast('Manifest applied successfully', 'success');
        } catch (err: any) {
            addToast(`Apply failed: ${err.message}`, 'error');
        } finally {
            setApplyingYaml(false);
        }
    };



    // Keyboard shortcut to close
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    if (!item) return null;

    const isReadOnly = ['nodes', 'events', 'storageclasses', 'namespaces'].includes(item.type?.toLowerCase());

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
                        <div className="p-4 h-full flex flex-col min-h-0 overflow-hidden">
                            <div className="flex items-center justify-between mb-4 bg-black/20 p-2 rounded-lg border border-gray-800">
                                <div className="flex items-center gap-3">
                                    <Terminal className="w-4 h-4 text-primary" />
                                    <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">Resource Manifest</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    {!isReadOnly && (
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-bold uppercase transition-colors ${isEditing ? 'text-primary' : 'text-gray-500'}`}>Edit Mode</span>
                                            <button 
                                                onClick={() => setIsEditing(!isEditing)}
                                                className={`relative w-10 h-5 rounded-full transition-all duration-300 ${isEditing ? 'bg-primary' : 'bg-gray-700'}`}
                                            >
                                                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-300 ${isEditing ? 'left-6' : 'left-1'}`} />
                                            </button>
                                        </div>
                                    )}
                                    <button 
                                        onClick={() => copyToClipboard(isEditing ? editedYaml : yaml)} 
                                        className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-white rounded transition-colors"
                                        title="Copy to clipboard"
                                    >
                                        <Copy className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {loadingYaml ? (
                                <div className="flex-1 flex justify-center items-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
                            ) : (
                                <div className="flex-1 flex flex-col min-h-0 rounded-xl overflow-hidden border border-gray-800 shadow-2xl">
                                    {isEditing ? (
                                        <div className="flex-1 flex flex-col min-h-0">
                                            <div className="flex-1 min-h-0 bg-[#1e1e1e]">
                                                <Editor
                                                    height="100%"
                                                    defaultLanguage="yaml"
                                                    theme="vs-dark"
                                                    value={editedYaml}
                                                    onChange={(val) => setEditedYaml(val || '')}
                                                    options={{
                                                        minimap: { enabled: false },
                                                        fontSize: 12,
                                                        fontFamily: 'JetBrains Mono, monospace',
                                                        scrollBeyondLastLine: false,
                                                        lineNumbers: 'on',
                                                        automaticLayout: true,
                                                        padding: { top: 16, bottom: 16 }
                                                    }}
                                                />
                                            </div>
                                            <div className="p-4 bg-[#141414] border-t border-white/10 flex justify-end items-center gap-4">
                                                {editedYaml !== yaml && !applyingYaml && (
                                                    <span className="text-[10px] text-primary font-bold uppercase tracking-widest opacity-80">
                                                        Unsaved changes
                                                    </span>
                                                )}
                                                <button 
                                                    onClick={handleApply}
                                                    disabled={applyingYaml || editedYaml === yaml}
                                                    className={`
                                                        flex items-center gap-2 px-6 py-2 
                                                        rounded-lg text-[11px] font-bold uppercase tracking-wider
                                                        transition-all duration-200
                                                        ${applyingYaml || editedYaml === yaml 
                                                            ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                                                            : 'bg-primary text-black hover:bg-primary/90 active:scale-95 shadow-lg shadow-black/40'
                                                        }
                                                    `}
                                                >
                                                    {applyingYaml ? (
                                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <Save className="w-3.5 h-3.5" />
                                                    )}
                                                    {applyingYaml ? 'Deploying...' : 'Deploy Changes'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <pre className="flex-1 text-[11px] font-mono text-gray-300 bg-[#1a1a1a] p-6 overflow-auto scrollbar-thin scrollbar-thumb-gray-800 leading-relaxed">
                                            {yaml}
                                        </pre>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="p-6 space-y-6">
                            <QuickActions 
                                item={item}
                                resName={resName}
                                onClose={onClose}
                                onScale={onScale} 
                                onRestart={onRestart} 
                                onDelete={onDelete} 
                            />

                            {/* Resource Metrics Trend Chart */}
                            {(() => {
                                const historyKey = `${namespace}/${resName}`;
                                const podHistory = metricsHistory?.[historyKey];
                                const cpuData = podHistory?.cpu || [];
                                const memData = podHistory?.memory || [];
                                const timestamps = podHistory?.timestamps || [];
                                if (item.type !== 'pods') return null;

                                if (!mountChart || cpuData.length === 0) {
                                    return (
                                        <div className="bg-[#1a1a1a] rounded-xl p-5 border border-gray-800 shadow-inner flex flex-col items-center justify-center py-12 text-center min-h-[250px]">
                                            <Activity className="w-8 h-8 text-cyan-400 animate-pulse mb-3" />
                                            <span className="text-xs font-semibold text-gray-300">Synchronizing live APM stream...</span>
                                            <span className="text-[10px] text-gray-500 font-mono mt-1">Collecting telemetry coordinates (updated every 30s)</span>
                                        </div>
                                    );
                                }

                                const stableNow = timestamps[timestamps.length - 1] || Date.now();
                                 const chartData = cpuData.map((cpuVal, idx) => {
                                      const memVal = memData[idx] || 0;
                                      const timestamp = timestamps[idx] || (stableNow - (cpuData.length - 1 - idx) * 30000);
                                      const parsedCpu = typeof cpuVal === 'string' ? (parseInt(cpuVal) || 0) : (Number(cpuVal) || 0);
                                      const parsedMem = typeof memVal === 'string' ? (parseInt(memVal) || 0) : (Number(memVal) || 0);
                                      
                                      // Calculate pre-formatted timeline tick strings
                                      const secondsBack = Math.round((stableNow - timestamp) / 1000);
                                      let relativeStr = 'Now';
                                      if (secondsBack >= 15) {
                                          if (secondsBack < 60) relativeStr = `-${secondsBack}s`;
                                          else if (secondsBack < 3600) relativeStr = `-${Math.round(secondsBack / 60)}m`;
                                          else relativeStr = `-${(secondsBack / 3600).toFixed(1)}h`;
                                      }
                                      
                                      const clockStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                                      
                                      return {
                                          index: idx, // stable index baseline
                                          cpu: parsedCpu,
                                          memory: parsedMem,
                                          relativeStr,
                                          clockStr
                                      };
                                  });

                                return (
                                    <div className="bg-[#1a1a1a] rounded-xl p-5 border border-gray-800 shadow-inner space-y-4">
                                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                            <div>
                                                <h3 className="text-xs font-semibold text-gray-200 uppercase tracking-wider">Live Resource Trends</h3>
                                                <p className="text-[10px] text-gray-500 font-mono mt-0.5">Real-time telemetry (30s intervals)</p>
                                            </div>
                                            <div className="flex items-center gap-3 text-[10px] font-mono">
                                                <div className="flex items-center gap-1 text-yellow-400">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                                                    <span>CPU ({cpuData[cpuData.length - 1]}m)</span>
                                                </div>
                                                <div className="flex items-center gap-1 text-fuchsia-400">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400" />
                                                    <span>Mem ({memData[memData.length - 1]} Mi)</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            {/* CPU Chart */}
                                            <div className="space-y-1">
                                                <span className="text-[9px] text-gray-400 uppercase tracking-wider font-semibold block">CPU Utilization History</span>
                                                <div className="h-28 w-full bg-black/10 rounded-xl p-2 border border-white/[0.02]">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <AreaChart data={chartData} margin={{ top: 5, bottom: 5, left: -20, right: 5 }}>
                                                            <defs>
                                                                <linearGradient id="cpuTrendGrad" x1="0" y1="0" x2="0" y2="1">
                                                                    <stop offset="5%" stopColor="#eab308" stopOpacity={0.25}/>
                                                                    <stop offset="95%" stopColor="#eab308" stopOpacity={0}/>
                                                                </linearGradient>
                                                            </defs>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#222222" vertical={false} />
                                                            <XAxis 
                                                                 dataKey="index"
                                                                 stroke="#555555" 
                                                                 fontSize={8} 
                                                                 tickLine={false} 
                                                                 axisLine={false} 
                                                                 tickFormatter={(val) => chartData[val]?.relativeStr || ''}
                                                             />
                                                            <YAxis 
                                                                stroke="#555555" 
                                                                fontSize={8} 
                                                                tickLine={false} 
                                                                axisLine={false} 
                                                                tickFormatter={(val) => `${val}m`}
                                                            />
                                                            <Tooltip
                                                                 contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
                                                                 labelFormatter={(label) => chartData[Number(label)]?.clockStr || ''}
                                                                 labelStyle={{ fontSize: '9px', color: '#888', fontFamily: 'monospace' }}
                                                                 itemStyle={{ fontSize: '10px', color: '#eab308' }}
                                                                 formatter={(value) => [`${value} millicores`, 'CPU Usage']}
                                                             />
                                                            <Area 
                                                                type="monotone" 
                                                                dataKey="cpu" 
                                                                stroke="#eab308" 
                                                                fill="url(#cpuTrendGrad)" 
                                                                strokeWidth={1.2} 
                                                                dot={{ r: 1.5, strokeWidth: 1 }}
                                                                animationDuration={150}
                                                                connectNulls={true}
                                                            />
                                                        </AreaChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>

                                            {/* Memory Chart */}
                                            <div className="space-y-1">
                                                <span className="text-[9px] text-gray-400 uppercase tracking-wider font-semibold block">Memory Utilization History</span>
                                                <div className="h-28 w-full bg-black/10 rounded-xl p-2 border border-white/[0.02]">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <AreaChart data={chartData} margin={{ top: 5, bottom: 5, left: -20, right: 5 }}>
                                                            <defs>
                                                                <linearGradient id="memTrendGrad" x1="0" y1="0" x2="0" y2="1">
                                                                    <stop offset="5%" stopColor="#d946ef" stopOpacity={0.25}/>
                                                                    <stop offset="95%" stopColor="#d946ef" stopOpacity={0}/>
                                                                </linearGradient>
                                                            </defs>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#222222" vertical={false} />
                                                            <XAxis 
                                                                 dataKey="index"
                                                                 stroke="#555555" 
                                                                 fontSize={8} 
                                                                 tickLine={false} 
                                                                 axisLine={false} 
                                                                 tickFormatter={(val) => chartData[val]?.relativeStr || ''}
                                                             />
                                                            <YAxis 
                                                                stroke="#555555" 
                                                                fontSize={8} 
                                                                tickLine={false} 
                                                                axisLine={false} 
                                                                tickFormatter={(val) => `${val}M`}
                                                            />
                                                            <Tooltip
                                                                 contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
                                                                 labelFormatter={(label) => chartData[Number(label)]?.clockStr || ''}
                                                                 labelStyle={{ fontSize: '9px', color: '#888', fontFamily: 'monospace' }}
                                                                 itemStyle={{ fontSize: '10px', color: '#d946ef' }}
                                                                 formatter={(value) => [`${value} MiB`, 'Memory Usage']}
                                                             />
                                                            <Area 
                                                                type="monotone" 
                                                                dataKey="memory" 
                                                                stroke="#d946ef" 
                                                                fill="url(#memTrendGrad)" 
                                                                strokeWidth={1.2} 
                                                                dot={{ r: 1.5, strokeWidth: 1 }}
                                                                animationDuration={150}
                                                                connectNulls={true}
                                                            />
                                                        </AreaChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

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
                                                <tr>
                                                    <th className="px-3 py-2 font-medium w-1/4">Type</th>
                                                    <th className="px-3 py-2 font-medium w-1/6">Status</th>
                                                    <th className="px-3 py-2 font-medium">Reason & Message</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-800/50">
                                                {item.data.conditions.map((c: any, i: number) => (
                                                    <tr key={i} className="align-top">
                                                        <td className="px-3 py-3 text-gray-200 font-medium">{c.type}</td>
                                                        <td className="px-3 py-3">
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${c.status === 'True' ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-500'}`}>
                                                                {c.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <div className="text-gray-300 font-semibold text-[11px] mb-1">{c.reason !== '—' ? c.reason : 'Status Info'}</div>
                                                            {c.message && (
                                                                <div className="text-[11px] leading-relaxed text-gray-500 break-words max-w-md bg-black/10 p-2 rounded border border-white/[0.02]">
                                                                    {c.message}
                                                                </div>
                                                            )}
                                                        </td>
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

// ── Namespace Overview Component ──────────────────────────────────────────────

interface NamespaceOverviewProps {
    data: any;
    onSwitchTab: (tab: string) => void;
    onSelectItem: (item: any) => void;
}

function NamespaceOverview({ data, onSwitchTab, onSelectItem }: NamespaceOverviewProps) {
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function KubernetesDashboard() {
    const { 
        available, context, namespaces, selectedNamespace, setSelectedNamespace,
        scaleDeployment, restartDeployment, deleteResource 
    } = useKubernetes();

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
            const oneDayAgo = now - 24 * 60 * 60 * 1000;

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

            // Prune data older than 24 hours across ALL keys
            for (const key of Object.keys(next)) {
                const timestamps = next[key].timestamps;
                let pruneIndex = 0;
                while (pruneIndex < timestamps.length && timestamps[pruneIndex] < oneDayAgo) {
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
                            <NamespaceOverview 
                                data={overviewData} 
                                onSwitchTab={(tab) => { setActiveResource(tab); setSearchQuery(''); }}
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
                                                                <td className="px-4 py-2.5"><PodStatusBadge status={item.status} isTerminating={item.isTerminating} /></td>
                                                                <td className="px-4 py-2.5">
                                                                    <div className="flex items-center justify-center gap-2">
                                                                        <span className="font-mono text-xs text-yellow-400/80 min-w-[40px] text-right">
                                                                            {parseCpu(getMetricForPod(metrics, name).cpu)}
                                                                        </span>
                                                                        {metricsHistory[`${selectedNamespace}/${name}`]?.cpu ? (
                                                                            <MiniSparkline data={metricsHistory[`${selectedNamespace}/${name}`].cpu.slice(-15)} color="#eab308" />
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
                                                                            <MiniSparkline data={metricsHistory[`${selectedNamespace}/${name}`].memory.slice(-15)} color="#d946ef" />
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
                <DetailPanel 
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
