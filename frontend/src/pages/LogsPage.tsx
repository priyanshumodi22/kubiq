import { useState } from 'react';
import { useServices } from '../hooks/useServices';
import { useAuth } from '../contexts/AuthContext';
import { LogViewer } from '../components/LogViewer';
import { ConfigureLogModal } from '../components/ConfigureLogModal';
import { DeleteLogDialog } from '../components/DeleteLogDialog';
import { EditLogDialog } from '../components/EditLogDialog';
import { Plus, Search, Server, AlertCircle, FileText, Trash2, Edit2 } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { ServiceStatus } from '../types';

export default function LogsPage() {
    const { services, refresh } = useServices();
    const { hasRole } = useAuth();
    const isAdmin = hasRole('kubiq-admin');
    const { addToast } = useToast();
    const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [deleteLogService, setDeleteLogService] = useState<ServiceStatus | null>(null);
    const [editLogService, setEditLogService] = useState<ServiceStatus | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Filter services that have a logPath configured
    const configuredServices = services.filter(s => s.logPath);

    const filteredServices = configuredServices.filter(s => 
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        s.logPath?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const selectedService = services.find(s => s.id === selectedServiceId);

    const handleDeleteClick = (e: React.MouseEvent, service: ServiceStatus) => {
        e.stopPropagation(); // Prevent selecting the service when clicking delete
        setDeleteLogService(service);
    };

    const handleEditClick = (e: React.MouseEvent, service: ServiceStatus) => {
        e.stopPropagation();
        setEditLogService(service);
    };

    const handleDeleteSuccess = () => {
        addToast('Log source removed successfully', 'success');
        
        // If the deleted service was selected, deselect it
        if (deleteLogService && deleteLogService.id === selectedServiceId) {
             setSelectedServiceId(null);
        }
        
        refresh();
    };

    const handleEditSuccess = () => {
        addToast('Log source updated successfully', 'success');
        refresh();
    };

    return (
        // Height Calculation: 100vh - (Header+TopPadding) - (Footer+BottomPadding)
        // using calc to ensure it fits without scrolling the page
        <div className="relative flex flex-col lg:flex-row gap-6 h-[calc(100vh-14rem)] mt-4">
            
            {/* Background Effects (Matched to Dashboard) */}
            <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-br from-bg via-bg to-bg-surface"></div>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.05),transparent_50%)]"></div>
                <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
                <div className="absolute top-1/3 -right-20 w-80 h-80 bg-primary/3 rounded-full blur-3xl"></div>
                <div className="absolute bottom-20 left-1/4 w-72 h-72 bg-primary/4 rounded-full blur-3xl"></div>
            </div>

            {/* Sidebar List */}
            <div className="w-full lg:w-1/4 flex flex-col bg-bg-surface/50 backdrop-blur-sm border border-gray-800 rounded-xl overflow-hidden z-10">
                <div className="p-4 border-b border-gray-800 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-gray-200">Log Sources</h2>
         
                        <button 
                            onClick={() => setIsConfigModalOpen(true)}
                            className="p-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors"
                            title="Add Log Source"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
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
                    {filteredServices.length === 0 ? (
                         <div className="text-center py-8 text-gray-500 text-xs">
                            {searchQuery ? 'No matches found' : 'No logs configured'}
                            {!searchQuery && (
                                <button 
                                    onClick={() => setIsConfigModalOpen(true)}
                                    className="block mx-auto mt-2 text-primary hover:underline hover:text-primary/80"
                                >
                                    Configure one now
                                </button>
                            )}
                        </div>
                    ) : (
                        filteredServices.map(service => (
                            <div
                                key={service.id}
                                onClick={() => setSelectedServiceId(service.id)}
                                className={`w-full text-left px-3 py-3 rounded-lg flex items-start space-x-3 transition-colors cursor-pointer group relative ${
                                    selectedServiceId === service.id 
                                    ? 'bg-primary/10 border border-primary/20' 
                                    : 'hover:bg-white/5 border border-transparent'
                                }`}
                            >
                                <div className={`mt-0.5 p-1 rounded ${selectedServiceId === service.id ? 'text-primary' : 'text-gray-400'}`}>
                                    <Server className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0 pr-6">
                                    <div className={`text-sm font-medium truncate ${selectedServiceId === service.id ? 'text-white' : 'text-gray-300'}`}>
                                        {service.name}
                                    </div>
                                    <div className="text-[10px] text-gray-500 truncate font-mono" title={service.logPath}>
                                        {service.logPath}
                                    </div>
                                </div>
                                {service.status === 'down' && (
                                    <AlertCircle className="w-3 h-3 text-red-500 mr-2" />
                                )}
                                
                                {isAdmin && (
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                </div>
            </div>

            {/* Main Log Viewer Area */}
            <div className="flex-1 flex flex-col min-h-0 bg-bg-surface/30 border border-gray-800 rounded-xl overflow-hidden backdrop-blur-sm relative z-10">
                {selectedService ? (
                     <LogViewer 
                        key={selectedService.id} // CRITICAL: Force remount on service switch to avoid stale state
                        logPath={selectedService.logPath!} 
                        isOpen={true} 
                        onClose={() => {}} 
                        serviceName={selectedService.name}
                        isEmbedded={true}
                     />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500 select-none">
                        <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-4 text-gray-600">
                             <FileText className="w-8 h-8" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-300 mb-2">No Service Selected</h3>
                        <p className="text-gray-500 text-sm max-w-xs text-center">Select a service from the sidebar to view its real-time logs.</p>
                    </div>
                )}
            </div>

            <ConfigureLogModal 
                isOpen={isConfigModalOpen}
                onClose={() => setIsConfigModalOpen(false)}
                onSuccess={refresh}
            />

            {deleteLogService && (
                <DeleteLogDialog
                    isOpen={!!deleteLogService}
                    onClose={() => setDeleteLogService(null)}
                    onSuccess={handleDeleteSuccess}
                    service={deleteLogService}
                />
            )}

            {editLogService && (
                <EditLogDialog
                    isOpen={!!editLogService}
                    onClose={() => setEditLogService(null)}
                    onSuccess={handleEditSuccess}
                    service={editLogService}
                />
            )}
        </div>
    );
}
