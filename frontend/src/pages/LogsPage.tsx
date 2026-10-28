import { TraceLogSearch } from '../components/TraceLogSearch';
import { SavedKubernetesLogSources } from '../components/SavedKubernetesLogSources';
import { KubernetesLogSourceModal } from '../components/KubernetesLogSourceModal';
import { LogSourceTypeDialog } from '../components/LogSourceTypeDialog';
import type { KubernetesLogSource } from '../types/kubernetesLogs';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useServices } from '../hooks/useServices';
import { useAuth } from '../contexts/AuthContext';
import { LogViewer } from '../components/LogViewer';
import { K8sLogViewer } from '../components/K8sLogViewer';
import { apiClient } from '../services/api';
import { ConfigureLogModal } from '../components/ConfigureLogModal';
import { DeleteLogDialog } from '../components/DeleteLogDialog';
import { Plus, Search, Server, AlertCircle, FileText, Trash2, Edit2 } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { ServiceStatus } from '../types';

export function SelectedLogViewer({ serviceName, service, initialSearchQuery = '' }: Readonly<{ serviceName: string | null; service?: ServiceStatus; initialSearchQuery?: string }>) {
    if (serviceName?.startsWith('k8s:')) return (
        <K8sLogViewer
            key={`${serviceName}-${initialSearchQuery}`}
            initialSearchQuery={initialSearchQuery}
            namespace={serviceName.split(':')[1] || 'default'}
            deploymentName={serviceName.split(':')[2] || serviceName.split(':')[1] || 'unknown'}
            containers={[{ name: 'main', image: '' }]}
        />
    );
    if (service) return (
        <LogViewer
            key={`${service.id}-${service.logSources?.length || 0}-${initialSearchQuery}`}
            initialSearchQuery={initialSearchQuery}
            logPath={service.logPath!}
            logSources={service.logSources}
            isOpen={true}
            onClose={() => {}}
            serviceName={service.name}
            isEmbedded={true}
        />
    );
    return (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 select-none">
            <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-4 text-gray-600">
                <FileText className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-medium text-gray-300 mb-2">No Service Selected</h3>
            <p className="text-gray-500 text-sm max-w-xs text-center">Select a service from the sidebar to view its real-time logs.</p>
            {initialSearchQuery && <p className="mt-3 max-w-sm break-all text-center text-xs text-text-dim">Trace {initialSearchQuery}: select a source to search its retained logs.</p>}
        </div>
    );
}

function renderLogsContent({ traceId, spanId, onWholeTrace }: { traceId: string; spanId: string; onWholeTrace: () => void }, source: KubernetesLogSource | null, serviceName: string | null, service: ServiceStatus | undefined, version: number, onAllSources: () => void) {
    if (traceId) return <TraceLogSearch traceId={traceId} spanId={spanId || undefined} onWholeTrace={onWholeTrace} serviceName={source ? `k8s:${source.namespace}:${source.id}` : serviceName || undefined} onAllSources={onAllSources} />;
    if (source) return <K8sLogViewer key={`${source.id}-${source.updatedAt}-${version}`} namespace={source.namespace} sourceId={source.id} sourceName={source.name} containers={[]} />;
    return <SelectedLogViewer serviceName={serviceName} service={service} />;
}

export default function LogsPage() {
    const [params, setParams] = useSearchParams();
    const spanSearch = params.get('spanId') || '';
    const requestedTrace = params.get('traceId') || params.get('search') || '';
    const traceSearch = /^[a-f\d]{16}(?:[a-f\d]{16})?$/i.test(requestedTrace) ? requestedTrace : '';
    const { services, refresh } = useServices();
    const { hasPermission } = useAuth();
    const isAdmin = hasPermission('services.manage') && hasPermission('logs.raw.read');
    const { addToast } = useToast();
    const [chooserOpen, setChooserOpen] = useState(false);
    const [kubeDraft, setKubeDraft] = useState<KubernetesLogSource | null | undefined>(undefined);
    const [selectedKubeSource, setSelectedKubeSource] = useState<KubernetesLogSource | null>(null);
    const [kubeVersion, setKubeVersion] = useState(0);
    const [selectedServiceName, setSelectedServiceName] = useState<string | null>(null);
    
    // Config Modal State
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [configService, setConfigService] = useState<string | undefined>(undefined);

    const [deleteLogService, setDeleteLogService] = useState<ServiceStatus | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [discoveredServices, setDiscoveredServices] = useState<string[]>([]);
    
    useEffect(() => {
        apiClient.getDiscoveredLogServices().then(setDiscoveredServices).catch(console.error);
    }, []);

    // Filter services that have logs configured (either legacy or new sources)
    // Filter services that have logs configured (strictly new sources)
    const configuredServices = services.filter(s => 
        s.logSources && s.logSources.length > 0
    );

    const filteredServices = configuredServices.filter(s => 
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredK8sServices = discoveredServices.filter(s => 
        s.startsWith('k8s:') && !/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(s.split(':')[2] || '') && s.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const selectedService = services.find(s => s.name === selectedServiceName);

    const handleDeleteClick = (e: React.MouseEvent, service: ServiceStatus) => {
        e.stopPropagation(); // Prevent selecting the service when clicking delete
        setDeleteLogService(service);
    };

    const handleEditClick = (e: React.MouseEvent, service: ServiceStatus) => {
        e.stopPropagation();
        setConfigService(service.name);
        setIsConfigModalOpen(true);
    };

    const openNewConfig = () => {
        setConfigService(undefined);
        setChooserOpen(true);
    };

    const handleDeleteSuccess = () => {
        addToast('Log source removed successfully', 'success');
        
        // If the deleted service was selected, deselect it
        // If the deleted service was selected, deselect it
        if (deleteLogService?.name === selectedServiceName) {
             setSelectedServiceName(null);
        }
        
        refresh();
    };

    return (
        // Height Calculation: 100vh - (Header+TopPadding) - (Footer+BottomPadding)
        // using calc to ensure it fits without scrolling the page
        <div className="relative flex flex-col lg:flex-row gap-6 h-[calc(100vh-14rem)] mt-4">
            
            {/* Background Effects (Matched to Dashboard) */}
            <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
                <div className="absolute inset-0 bg-linear-to-br from-bg via-bg to-bg-surface"></div>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.05),transparent_50%)]"></div>
                <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
                <div className="absolute top-1/3 -right-20 w-80 h-80 bg-primary/3 rounded-full blur-3xl"></div>
                <div className="absolute bottom-20 left-1/4 w-72 h-72 bg-primary/4 rounded-full blur-3xl"></div>
            </div>

            {/* Sidebar List */}
            <div className="w-full lg:w-1/4 flex flex-col bg-bg-surface/50 backdrop-blur-sm border border-gray-800 rounded-xl overflow-hidden z-10">
                <div className="p-4 border-b border-gray-800 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-gray-200 text-sm">Log Sources</h2>
         
                        {isAdmin && (
                            <button 
                                onClick={openNewConfig}
                                className="p-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors"
                                title="Add Log Source"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input 
                            type="text" 
                            placeholder="Filter logs..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-bg/50 border border-gray-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-primary/50"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    <h3 className="px-2 pt-2 text-xs font-semibold text-text-dim">VM services</h3>
                    {filteredServices.length === 0 ? (
                         <div className="text-center py-8 text-gray-500 text-xs">
                            {searchQuery ? 'No matches found' : 'No logs configured'}
                            {!searchQuery && isAdmin && (
                                <button 
                                    onClick={openNewConfig}
                                    className="block mx-auto mt-2 text-primary hover:underline hover:text-primary/80"
                                >
                                    Configure one now
                                </button>
                            )}
                        </div>
                    ) : (
                        filteredServices.map(service => (
                            <div
                                key={service.id || service.name} // Fallback to name if ID is missing
                                className={`w-full text-left px-3 py-3 rounded-lg flex items-center gap-3 transition-colors cursor-pointer group relative ${
                                    selectedServiceName === service.name 
                                    ? 'bg-primary/10 border border-primary/20' 
                                    : 'hover:bg-white/5 border border-transparent'
                                }`}
                            >
                                <button type="button" onClick={() => { setSelectedKubeSource(null); setSelectedServiceName(service.name); }} aria-label={`View logs for ${service.name}`} aria-pressed={selectedServiceName === service.name} className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
                                <div className={`pointer-events-none p-1 rounded ${selectedServiceName === service.name ? 'text-primary' : 'text-gray-400'}`}>
                                    <Server className="w-4 h-4" />
                                </div>
                                <div className="pointer-events-none flex-1 min-w-0 pr-6">
                                    <div className={`text-sm font-medium truncate ${selectedServiceName === service.name ? 'text-white' : 'text-gray-300'}`}>
                                        {service.name}
                                    </div>
                                    <div className="text-[10px] text-gray-500 truncate font-mono" title={service.logPath}>
                                        {service.logPath}
                                    </div>
                                </div>
                                {service.currentStatus === 'unhealthy' && (
                                    <AlertCircle className="pointer-events-none w-3 h-3 text-red-500 mr-2" />
                                )}
                                
                                {isAdmin && (
                                    <div className="absolute z-10 right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => handleEditClick(e, service)}
                                            className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                                            title="Edit log configuration"
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={(e) => handleDeleteClick(e, service)}
                                            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-white/10 rounded-md transition-colors"
                                            title="Remove log configuration"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                    
                    <SavedKubernetesLogSources version={kubeVersion} search={searchQuery} selectedId={selectedKubeSource?.id} onSelect={source => { setSelectedServiceName(null); setSelectedKubeSource(source); setKubeVersion(value => value + 1); }} onEdit={setKubeDraft} onRemoved={() => { setSelectedKubeSource(null); setKubeVersion(value => value + 1); }} />
                    {/* Kubernetes Section */}
                    {filteredK8sServices.length > 0 && (
                        <>
                            <div className="pt-4 pb-2 border-t border-gray-800/50 mt-2">
                                <h2 className="font-bold text-gray-200 text-sm px-2">Previously discovered workloads</h2>
                            </div>
                            
                            {filteredK8sServices.length === 0 ? (
                                <div className="text-center py-4 text-gray-500 text-xs">No matches found</div>
                            ) : (
                                filteredK8sServices.map(serviceName => {
                                    // Parse k8s:namespace:deployment
                                    const parts = serviceName.split(':');
                                    const ns = parts[1] || 'unknown';
                                    const deploy = parts[2] || parts[1] || serviceName;
                                    
                                    return (
                                        <div
                                            key={serviceName}
                                            className={`w-full text-left px-3 py-3 rounded-lg flex items-center gap-3 transition-colors cursor-pointer group relative ${
                                                selectedServiceName === serviceName 
                                                ? 'bg-primary/10 border border-primary/20' 
                                                : 'hover:bg-white/5 border border-transparent'
                                            }`}
                                        >
                                            <button type="button" onClick={() => { setSelectedKubeSource(null); setSelectedServiceName(serviceName); }} aria-label={`View logs for ${serviceName}`} aria-pressed={selectedServiceName === serviceName} className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
                                            <div className={`pointer-events-none p-1 rounded ${selectedServiceName === serviceName ? 'text-primary' : 'text-gray-400'}`}>
                                                <Server className="w-4 h-4" />
                                            </div>
                                            <div className="pointer-events-none flex-1 min-w-0">
                                                <div className={`text-sm font-medium truncate ${selectedServiceName === serviceName ? 'text-white' : 'text-gray-300'}`}>
                                                    {deploy}
                                                </div>
                                                <div className="text-[10px] text-gray-500 truncate font-mono">
                                                    ns: {ns}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Main Log Viewer Area */}
            <div className="flex-1 flex flex-col min-h-0 bg-bg-surface/30 border border-gray-800 rounded-xl overflow-hidden backdrop-blur-sm relative z-10">
                {renderLogsContent({ traceId: traceSearch, spanId: spanSearch, onWholeTrace: () => { const next = new URLSearchParams(params); next.delete('spanId'); setParams(next); } }, selectedKubeSource, selectedServiceName, selectedService, kubeVersion, () => { setSelectedKubeSource(null); setSelectedServiceName(null); })}
            </div>

            {chooserOpen && <LogSourceTypeDialog kubernetes={hasPermission('kubernetes.read')} onVM={() => { setChooserOpen(false); setIsConfigModalOpen(true); }} onKubernetes={() => { setChooserOpen(false); setKubeDraft(null); }} onClose={() => setChooserOpen(false)} />}
            {kubeDraft !== undefined && <KubernetesLogSourceModal key={kubeDraft?.id || 'new'} source={kubeDraft} onClose={() => setKubeDraft(undefined)} onSaved={() => { setSelectedKubeSource(null); setKubeVersion(value => value + 1); }} />}
            <ConfigureLogModal 
                isOpen={isConfigModalOpen}
                onClose={() => setIsConfigModalOpen(false)}
                onSuccess={refresh}
                preSelectedService={configService}
            />

            {deleteLogService && (
                <DeleteLogDialog
                    isOpen={!!deleteLogService}
                    onClose={() => setDeleteLogService(null)}
                    onSuccess={handleDeleteSuccess}
                    service={deleteLogService}
                />
            )}
        </div>
    );
}
