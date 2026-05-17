import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import {
    RefreshCw, Activity, X, FileJson, Copy, Save, Terminal, ChevronRight, ShieldCheck
} from 'lucide-react';
import { Editor, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import yamlParser from 'js-yaml';

// Configure monaco to load from local node_modules instead of CDN
loader.config({ monaco });

import { apiClient } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { K8sLogViewer } from './K8sLogViewer';
import K8sTerminal from './K8sTerminal';
import { K8sQuickActions } from './K8sQuickActions';
import { copyToClipboard } from '../utils/k8sHelpers';

export interface K8sDetailPanelProps {
    item: any;
    onClose: () => void;
    namespace: string;
    onScale: (name: string, replicas: number) => Promise<void>;
    onRestart: (name: string) => Promise<void>;
    onDelete: (type: string, name: string) => Promise<void>;
    onApplyManifest: (manifest: string) => Promise<void>;
    metricsHistory?: Record<string, { cpu: number[], memory: number[], timestamps?: number[] }>;
}

export function K8sDetailPanel({ 
    item, 
    onClose, 
    namespace,
    onScale,
    onRestart,
    onDelete,
    onApplyManifest,
    metricsHistory = {}
}: K8sDetailPanelProps) {

    const [yaml, setYaml] = useState<string>('');
    const [loadingYaml, setLoadingYaml] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedYaml, setEditedYaml] = useState<string>('');
    const [applyingYaml, setApplyingYaml] = useState(false);
    const [activeTab, setActiveTab] = useState<'details' | 'yaml' | 'logs' | 'terminal'>('details');
    const [expandedContainers, setExpandedContainers] = useState<Record<number, boolean>>({});
    const { addToast } = useToast() as any;
    const canShowLogs = item?.type === 'pods' || item?.type === 'deployments';

    const toggleContainerExpand = (idx: number) => {
        setExpandedContainers(prev => ({ ...prev, [idx]: !prev[idx] }));
    };

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
                    {item?.type === 'pods' && (
                        <button onClick={() => setActiveTab('terminal')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'terminal' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>
                            Terminal
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto bg-[#111111] min-h-0">
                    {activeTab === 'terminal' && item?.type === 'pods' ? (
                        <K8sTerminal
                            namespace={item.data.namespace || item.data.metadata?.namespace || namespace}
                            podName={item.data.name || item.data.metadata?.name}
                            containers={
                                item.data.containers || 
                                item.data.spec?.containers || 
                                item.data.spec?.template?.spec?.containers || 
                                [{ name: 'main' }]
                            }
                        />
                    ) : activeTab === 'logs' && canShowLogs ? (
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
                            <K8sQuickActions 
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
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Containers</h3>
                                        <span className="text-[10px] text-gray-500 font-mono">Click container name to inspect base image specs</span>
                                    </div>
                                    <div className="space-y-3">
                                        {item.data.containers.map((c: any, i: number) => {
                                            const isExpanded = !!expandedContainers[i];
                                            
                                            // Image specs parser
                                            let registry = 'docker.io (DockerHub)';
                                            let repository = c.image;
                                            let tag = 'latest';
                                            const parts = c.image.split('/');
                                            if (parts.length > 1 && (parts[0].includes('.') || parts[0].includes(':') || parts[0] === 'localhost')) {
                                                registry = parts[0];
                                                repository = parts.slice(1).join('/');
                                            }
                                            const tagParts = repository.split(':');
                                            if (tagParts.length > 1) {
                                                repository = tagParts[0];
                                                tag = tagParts[1];
                                            }
                                            
                                            let digest = '';
                                            if (c.imageID) {
                                                const match = c.imageID.match(/sha256:([a-fA-F0-9]{64})/);
                                                if (match) digest = 'sha256:' + match[1];
                                            }

                                            return (
                                                <div key={i} className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-3 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2 cursor-pointer group" onClick={() => toggleContainerExpand(i)}>
                                                            <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                                            <span className="font-mono text-sm text-primary font-semibold group-hover:text-primary/80 transition-colors">{c.name}</span>
                                                        </div>
                                                        <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold ${c.ready ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                                            {c.ready ? 'Ready' : 'Not Ready'}
                                                        </span>
                                                    </div>

                                                    <div className="text-[11px] text-gray-400 font-mono break-all bg-black/10 p-2 rounded cursor-pointer hover:text-gray-200 transition-colors" onClick={() => copyToClipboard(c.image)} title="Click to copy image URL">
                                                        {c.image}
                                                    </div>

                                                    <div className="flex gap-4 text-xs bg-black/20 px-3 py-2 rounded font-mono">
                                                        <span>State: <span className="text-white capitalize">{c.state}</span></span>
                                                        <span>Restarts: <span className={c.restartCount > 0 ? 'text-orange-400 font-bold' : 'text-gray-300'}>{c.restartCount}</span></span>
                                                        {c.stateReason && <span className="text-orange-400">Reason: {c.stateReason}</span>}
                                                    </div>

                                                    {/* Image Inspector Details */}
                                                    {isExpanded && (
                                                        <div className="pt-2 border-t border-gray-800/60 space-y-3 text-xs">
                                                            <div className="grid grid-cols-2 gap-3 bg-black/10 p-3 rounded-lg border border-white/[0.02]">
                                                                <div>
                                                                    <span className="text-gray-500 text-[10px] uppercase block font-semibold">Registry Source</span>
                                                                    <span className="text-gray-300 font-mono">{registry}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-gray-500 text-[10px] uppercase block font-semibold">Image Tag</span>
                                                                    <span className="text-primary font-mono font-bold bg-primary/5 border border-primary/20 px-1.5 py-0.5 rounded inline-block mt-0.5">{tag}</span>
                                                                </div>
                                                                <div className="col-span-2">
                                                                    <span className="text-gray-500 text-[10px] uppercase block font-semibold">Registry Repository</span>
                                                                    <span className="text-gray-300 font-mono break-all">{repository}</span>
                                                                </div>
                                                                {digest && (
                                                                    <div className="col-span-2">
                                                                        <span className="text-gray-500 text-[10px] uppercase block font-semibold">SHA-256 Digest Signature</span>
                                                                        <span className="text-[10px] text-gray-400 font-mono break-all bg-black/35 p-1.5 rounded border border-white/[0.01] block mt-0.5">{digest}</span>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Security & OS specifications */}
                                                            <div className="bg-black/10 p-3 rounded-lg border border-white/[0.02] space-y-2">
                                                                <div className="flex items-center gap-1.5 text-gray-400 font-semibold text-[10px] uppercase tracking-wider">
                                                                    <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                                                                    <span>Container Security Context</span>
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                                                                    <div className="flex items-center justify-between bg-black/20 px-2 py-1 rounded">
                                                                        <span className="text-gray-500">Run As Non-Root:</span>
                                                                        <span className={c.securityContext?.runAsNonRoot ? 'text-green-400 font-bold' : 'text-gray-400'}>
                                                                            {c.securityContext?.runAsNonRoot ? 'Yes' : 'No'}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center justify-between bg-black/20 px-2 py-1 rounded">
                                                                        <span className="text-gray-500">Privileged:</span>
                                                                        <span className={c.securityContext?.privileged ? 'text-red-400 font-bold' : 'text-gray-400'}>
                                                                            {c.securityContext?.privileged ? 'Yes' : 'No'}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center justify-between bg-black/20 px-2 py-1 rounded col-span-2">
                                                                        <span className="text-gray-500">ReadOnly RootFS:</span>
                                                                        <span className={c.securityContext?.readOnlyRootFilesystem ? 'text-green-400 font-bold' : 'text-gray-400'}>
                                                                            {c.securityContext?.readOnlyRootFilesystem ? 'Yes' : 'No'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
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
