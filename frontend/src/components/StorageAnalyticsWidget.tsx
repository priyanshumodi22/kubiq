
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HardDrive, Settings, AlertTriangle, CheckCircle } from 'lucide-react';
import { apiClient } from '../services/api';
import { StoragePrediction, SystemMetrics, DiskInfo } from '../types';

export const StorageAnalyticsWidget = () => {
    const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
    const [predictions, setPredictions] = useState<StoragePrediction[]>([]);
    const [showConfig, setShowConfig] = useState(false);
    const [allDisks, setAllDisks] = useState<DiskInfo[]>([]);
    const [selectedMounts, setSelectedMounts] = useState<string[]>([]);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [animate, setAnimate] = useState(false);

    useEffect(() => {
        if (!loading && metrics) {
             requestAnimationFrame(() => {
                 setAnimate(true);
             });
        }
    }, [loading, metrics]);

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
    };

    const fetchData = async () => {
        try {
            const [stats, pred, config] = await Promise.all([
                apiClient.getSystemStats(),
                apiClient.getStoragePrediction(),
                apiClient.getMonitoredDisksConfig()
            ]);
            setMetrics(stats);
            if (Array.isArray(pred)) {
                setPredictions(pred);
            }
            setSelectedMounts(config);
            setLoading(false);
        } catch (error) {
            console.error('Failed to fetch storage data:', error);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000); 
        return () => clearInterval(interval);
    }, []);

    const openConfig = async () => {
        try {
            const disks = await apiClient.getAllDisks();
            setAllDisks(disks);
            setShowConfig(true);
        } catch (error) {
            console.error(error);
            showToast('Failed to load disk list', 'error');
        }
    };

    const toggleDisk = (mount: string) => {
        if (selectedMounts.includes(mount)) {
            setSelectedMounts(selectedMounts.filter(m => m !== mount));
        } else {
            setSelectedMounts([...selectedMounts, mount]);
        }
    };

    const saveConfig = async () => {
        try {
            await apiClient.updateMonitoredDisks(selectedMounts);
            setShowConfig(false);
            fetchData(); 
            showToast('Storage preferences saved successfully! 💾', 'success');
        } catch (error) {
            console.error(error);
            showToast('Failed to save changes', 'error');
        }
    };

    if (loading || !metrics) {
        return <div className="animate-pulse h-48 bg-gray-900 rounded-lg mt-4"></div>;
    }

    // Only show monitored disks in the main view
    const monitoredDisks = metrics.disks.filter(d => selectedMounts.length === 0 || selectedMounts.includes(d.mount));

    return (
        <>
            {/* Global Toast Portal */}
            {toast && createPortal(
                <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-200 ${
                    toast.type === 'success' ? 'bg-green-500/90 text-white' : 'bg-red-500/90 text-white'
                }`}>
                    {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    <span className="text-sm font-medium">{toast.message}</span>
                </div>,
                document.body
            )}

            <div className="bg-bg-card border border-border-color rounded-lg p-6 shadow-lg backdrop-blur-sm bg-opacity-80 mt-4 relative overflow-hidden">
                {/* Background Gradient */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full filter blur-3xl pointer-events-none -mr-16 -mt-16"></div>
    
                <div className="flex justify-between items-center mb-6 relative z-20">
                    <h3 className="text-gray-300 font-medium text-lg flex items-center">
                        <HardDrive className="w-5 h-5 mr-2 text-primary" /> Storage Analytics
                    </h3>
                    
                    {/* Configuration Dropdown */}
                    <div className="relative">
                        <button 
                            ref={(el) => {
                                if (el && showConfig) {
                                    // Simple positioning logic 
                                }
                            }}
                            onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setDropdownPos({ top: rect.bottom + window.scrollY + 8, right: window.innerWidth - rect.right });
                                openConfig(); 
                            }}
                            className="flex items-center space-x-2 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors border border-gray-700"
                        >
                            <Settings className="w-3 h-3" />
                            <span>Configure Disks</span>
                        </button>
    
                        {showConfig && createPortal(
                            (
                            <>
                                {/* Click overlay to close */}
                                <div className="fixed inset-0 z-[100]" onClick={() => setShowConfig(false)}></div>
                                
                                {/* Dropdown Content - Portal'd to Body */}
                                <div 
                                    className="absolute z-[101] w-80 bg-gray-900 border border-border-color rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                                    style={{
                                        top: dropdownPos.top,
                                        right: dropdownPos.right
                                    }}
                                >
                                    <div className="p-4 border-b border-gray-800">
                                        <h3 className="text-sm font-bold text-white">Monitored Volumes</h3>
                                    </div>
                                    
                                    <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                                        {allDisks.map(disk => (
                                            <label key={disk.mount} className="flex items-center p-2 rounded hover:bg-gray-800 cursor-pointer transition-colors">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedMounts.includes(disk.mount)}
                                                    onChange={() => toggleDisk(disk.mount)}
                                                    className="form-checkbox h-4 w-4 text-primary rounded border-gray-600 bg-gray-700 focus:ring-offset-gray-900" 
                                                />
                                                <div className="ml-3 flex-1 min-w-0">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-white text-xs font-mono font-medium truncate mr-2" title={disk.mount}>{disk.mount}</span>
                                                        <span className="text-gray-500 text-[10px]">{disk.type}</span>
                                                    </div>
                                                    <div className="text-[10px] text-gray-500">
                                                        {(disk.size / 1024 / 1024 / 1024).toFixed(1)} GB
                                                    </div>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                    
                                    <div className="p-3 bg-gray-900/50 border-t border-gray-800 flex justify-end gap-2">
                                        <button 
                                            onClick={saveConfig}
                                            className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-white text-xs rounded transition-colors font-medium"
                                        >
                                            Save Changes
                                        </button>
                                    </div>
                                </div>
                            </>
                            ), document.body
                        )}
                    </div>
                </div>
    
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10">
                    {/* Disk List */}
                    <div className="space-y-4">
                        {monitoredDisks.length === 0 ? (
                            <p className="text-gray-500 text-sm italic">No disks monitored. Click configure to add disks.</p>
                        ) : (
                            monitoredDisks.map((disk) => {
                                const percent = Math.round(disk.use);
                                const prediction = predictions.find(p => p.mount === disk.mount);
                                
                                return (
                                    <div key={disk.mount} className="bg-gray-900/50 p-4 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors">
                                        <div className="flex justify-between items-center mb-2">
                                            <div className="flex items-center">
                                                <span className="font-mono text-sm text-white font-bold mr-2">{disk.mount}</span>
                                                <span className="text-xs text-gray-500">({disk.fs})</span>
                                            </div>
                                            <span className={`text-sm font-bold ${percent > 90 ? 'text-red-500' : percent > 75 ? 'text-yellow-500' : 'text-green-500'}`}>
                                                {percent}%
                                            </span>
                                        </div>
                                        <div className="w-full bg-gray-800 rounded-full h-2 mb-2">
                                            <div 
                                                className={`h-2 rounded-full ${percent > 90 ? 'bg-red-500' : percent > 75 ? 'bg-yellow-500' : 'bg-green-500'}`} 
                                                style={{ width: `${animate ? percent : 0}%`, transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)' }}
                                            ></div>
                                        </div>
                                        <div className="flex justify-between text-xs text-gray-500">
                                            <span>{(disk.used / 1024 / 1024 / 1024).toFixed(1)} GB Used</span>
                                            <span>{(disk.size / 1024 / 1024 / 1024).toFixed(1)} GB Total</span>
                                        </div>
                                        
                                    {/* Prediction Warning */}
                                    {prediction && prediction.trend === 'growing' && prediction.daysRemaining < 365 && (
                                        <div className={`mt-3 flex flex-col p-3 rounded ${prediction.isCritical ? 'bg-red-500/10 text-red-200 border border-red-500/20' : 'bg-blue-500/10 text-blue-200 border border-blue-500/20'}`}>
                                            <div className="flex items-center mb-1">
                                                <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
                                                <span className="text-xs font-bold uppercase tracking-wider">
                                                    {prediction.isCritical ? 'Critical Warning' : 'Usage Projection'}
                                                </span>
                                            </div>
                                            <div className="ml-6">
                                                <p className="text-xs opacity-90 mb-1">
                                                    At current rate, this disk will be <span className="font-bold underline">100% full</span> in:
                                                </p>
                                                <p className="text-lg font-bold">
                                                    {prediction.daysRemaining < 30 
                                                        ? `${prediction.daysRemaining} Days` 
                                                        : `~${Math.round(prediction.daysRemaining / 30)} Months`
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                    </div>
                                );
                            })
                        )}
                    </div>
    
                    {/* Graph / Summary Area */}
                    <div className="bg-gray-900/30 rounded-lg p-6 border border-gray-800 flex flex-col justify-center items-center text-center">
                       <div className="mb-4 relative">
                            <div className="w-32 h-32 rounded-full border-4 border-gray-800 flex items-center justify-center">
                                <HardDrive className="w-12 h-12 text-gray-600" />
                            </div>
                            {predictions.some(p => p.isCritical) && (
                                 <div className="absolute top-0 right-0 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center animate-bounce">
                                    <AlertTriangle className="w-5 h-5 text-white" />
                                 </div>
                            )}
                       </div>
                       
                       <h4 className="text-white font-medium mb-1">Storage Health Status</h4>
                       {predictions.some(p => p.isCritical) ? (
                           <p className="text-red-400 text-sm">Critical: One or more drives filling up fast.</p>
                       ) : (
                           <p className="text-green-400 text-sm flex items-center justify-center">
                               <CheckCircle className="w-4 h-4 mr-1" /> Stable. No immediate capacity risks.
                           </p>
                       )}
                       
                       <p className="text-gray-500 text-xs mt-4 max-w-xs">
                           Predictions are based on linear regression of usage trends over the last 30 days. Monitoring {monitoredDisks.length} volumes.
                       </p>
                    </div>
                </div>
            </div>
        </>
    );
};
