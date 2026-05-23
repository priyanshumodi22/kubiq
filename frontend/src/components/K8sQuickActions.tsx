import { useState } from 'react';
import { RefreshCw, Sliders, Trash2, Settings, Minus, Plus } from 'lucide-react';
import { K8sConfirmModal } from './K8sConfirmModal';
import { useAuth } from '../contexts/AuthContext';

export interface K8sQuickActionsProps {
    item: any;
    resName: string;
    onClose: () => void;
    onScale: (name: string, replicas: number) => Promise<void>;
    onRestart: (name: string) => Promise<void>;
    onDelete: (type: string, name: string) => Promise<void>;
}

export function K8sQuickActions({ 
    item,
    resName,
    onClose,
    onScale, 
    onRestart, 
    onDelete 
}: K8sQuickActionsProps) {
    // Hide management for non-manageable resources
    const nonManageable = ['nodes', 'events', 'storageclasses', 'namespaces'];
    if (nonManageable.includes(item.type?.toLowerCase())) return null;

    const { hasRole } = useAuth();
    const isAdmin = hasRole('kubiq-admin');
    if (!isAdmin) return null;

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
                            Replicas
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
                    className="flex items-center justify-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-lg text-xs font-medium transition-all sm:ml-auto disabled:opacity-50"
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

            <K8sConfirmModal 
                isOpen={confirmState.open && confirmState.type === 'restart'}
                onClose={() => setConfirmState({ type: null, open: false })}
                onConfirm={handleRestart}
                title="Trigger Rolling Restart?"
                message={`This will cycle all pods in ${resName} one by one. There will be no downtime.`}
                confirmText="Restart Now"
                variant="warning"
            />

            <K8sConfirmModal 
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
}
