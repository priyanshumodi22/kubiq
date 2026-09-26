import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Bell, Check, AlertCircle, Send, Pencil, ChevronDown, Info, RefreshCw } from 'lucide-react';
import { apiClient } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

interface NotificationConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface NotificationChannel {
    id: string;
    name: string;
    type: 'webhook' | 'email';
    config: {
        webhookUrl?: string;
        email?: string;
        smtpHost?: string;
        smtpPort?: number;
        smtpUser?: string;
        smtpPass?: string;
        smtpSecure?: boolean;
        senderEmail?: string;
        senderName?: string;
        cc?: string;
        bcc?: string;
    };
    enabled: boolean;
    events: {
        up: boolean;
        down: boolean;
    };
}

// Reusable Form Component
function ChannelForm({
    initialValues,
    onSubmit,
    onCancel,
    isLoading
}: {
    initialValues?: Partial<NotificationChannel>,
    onSubmit: (data: any) => void,
    onCancel?: () => void,
    isLoading: boolean
}) {
    const [name, setName] = useState(initialValues?.name || '');
    const [type, setType] = useState<'webhook' | 'email'>(initialValues?.type || 'webhook');
    const [config, setConfig] = useState<any>(initialValues?.config || {});
    const [events, setEvents] = useState(initialValues?.events || { up: true, down: true });

    // Custom Dropdown State
    const [isTypeOpen, setIsTypeOpen] = useState(false);
    const typeTriggerRef = React.useRef<HTMLButtonElement>(null);
    const typePanelRef = React.useRef<HTMLDivElement>(null);
    const [typeRect, setTypeRect] = useState<{ top: number, left: number, width: number } | null>(null);

    const channelTypes = [
        { value: 'webhook', label: 'Webhook (Slack/Teams/Discord)', icon: <Send className="w-4 h-4" /> },
        { value: 'email', label: 'Email (SMTP)', icon: <Bell className="w-4 h-4" /> },
    ];

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (typeTriggerRef.current?.contains(e.target as Node)) return;
            if (typePanelRef.current?.contains(e.target as Node)) return;
            setIsTypeOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit({ name, type, config, events, enabled: true });
    };

    const inputClasses = "w-full h-[46px] px-4 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all duration-200 text-sm";
    const labelClasses = "block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1";

    return (
        <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <div>
                    <label className={labelClasses}>Friendly Name</label>
                    <input
                        type="text"
                        required
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="e.g. DevOps Slack"
                        className={inputClasses}
                    />
                </div>

                <div>
                    <label className={labelClasses}>Channel Type</label>
                    <div className="relative">
                        <button
                            ref={typeTriggerRef}
                            type="button"
                            onClick={() => {
                                if (typeTriggerRef.current) {
                                    const r = typeTriggerRef.current.getBoundingClientRect();
                                    setTypeRect({ top: r.bottom + 4, left: r.left, width: r.width });
                                }
                                setIsTypeOpen(!isTypeOpen);
                            }}
                            className={`${inputClasses} flex items-center justify-between hover:border-primary/50 transition-all`}
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-primary">
                                    {channelTypes.find(t => t.value === type)?.icon}
                                </span>
                                <span>{channelTypes.find(t => t.value === type)?.label}</span>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isTypeOpen ? 'rotate-180' : ''}`} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Custom Dropdown Portal */}
            {isTypeOpen && typeRect && createPortal(
                <div
                    ref={typePanelRef}
                    style={{ position: 'fixed', top: typeRect.top, left: typeRect.left, width: typeRect.width, zIndex: 10000 }}
                    className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200"
                >
                    {channelTypes.map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => { setType(opt.value as any); setIsTypeOpen(false); }}
                            className={`w-full text-left px-4 py-3 text-sm transition-colors hover:bg-white/5 flex items-center gap-3 ${type === opt.value ? 'bg-primary/10 text-primary' : 'text-gray-300'
                                }`}
                        >
                            <span className={type === opt.value ? 'text-primary' : 'text-gray-500'}>
                                {opt.icon}
                            </span>
                            {opt.label}
                        </button>
                    ))}
                </div>,
                document.body
            )}

            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-5">
                {type === 'webhook' && (
                    <div className="space-y-1 animate-in fade-in slide-in-from-left-2 duration-300">
                        <label className={labelClasses}>Webhook URL</label>
                        <div className="relative">
                            <input
                                type="url"
                                required
                                value={config.webhookUrl || ''}
                                onChange={e => setConfig({ ...config, webhookUrl: e.target.value })}
                                placeholder="https://hooks.slack.com/services/..."
                                className={`${inputClasses} pl-10`}
                            />
                            <Send className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/50" />
                        </div>
                        <p className="mt-2 text-[10px] text-gray-500 flex items-center gap-1.5 ml-1">
                            <Info className="w-3 h-3" />
                            Works with Slack, Discord, MS Teams, and Google Chat
                        </p>
                    </div>
                )}

                {type === 'email' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className={labelClasses}>Sender Name</label>
                                <input
                                    type="text"
                                    value={config.senderName || ''}
                                    onChange={e => setConfig({ ...config, senderName: e.target.value })}
                                    placeholder="kubiq Alerts"
                                    className={inputClasses}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClasses}>Sender Email</label>
                                <input
                                    type="text"
                                    value={config.senderEmail || ''}
                                    onChange={e => setConfig({ ...config, senderEmail: e.target.value })}
                                    placeholder="no-reply@kubiq.local"
                                    className={inputClasses}
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className={labelClasses}>Recipient Email(s)</label>
                            <input
                                type="text"
                                value={config.email || ''}
                                onChange={e => setConfig({ ...config, email: e.target.value })}
                                placeholder="email1@example.com, email2@example.com"
                                className={inputClasses}
                            />
                            <p className="text-[10px] text-gray-500 mt-1.5 ml-1">Separate multiple addresses with commas</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className={labelClasses}>SMTP Host</label>
                                <input
                                    type="text"
                                    required
                                    value={config.smtpHost || ''}
                                    onChange={e => setConfig({ ...config, smtpHost: e.target.value })}
                                    placeholder="smtp.gmail.com"
                                    className={inputClasses}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClasses}>SMTP Port</label>
                                <input
                                    type="number"
                                    required
                                    value={config.smtpPort || 587}
                                    onChange={e => setConfig({ ...config, smtpPort: parseInt(e.target.value) })}
                                    className={inputClasses}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className={labelClasses}>Username</label>
                                <input
                                    type="text"
                                    value={config.smtpUser || ''}
                                    onChange={e => setConfig({ ...config, smtpUser: e.target.value })}
                                    className={inputClasses}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClasses}>Password</label>
                                <input
                                    type="password"
                                    value={config.smtpPass || ''}
                                    onChange={e => setConfig({ ...config, smtpPass: e.target.value })}
                                    className={inputClasses}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-6 px-1">
                <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setEvents({ ...events, up: !events.up })}>
                    <div className={`w-5 h-5 rounded border transition-all duration-200 flex items-center justify-center ${events.up ? 'bg-primary border-primary shadow-lg shadow-primary/20' : 'bg-black/40 border-white/10 group-hover:border-white/20'}`}>
                        {events.up && <Check className="w-3.5 h-3.5 text-black font-bold" />}
                    </div>
                    <span className="text-sm text-gray-300">Notify when <span className="text-success font-medium">UP ✅</span></span>
                </div>
                <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setEvents({ ...events, down: !events.down })}>
                    <div className={`w-5 h-5 rounded border transition-all duration-200 flex items-center justify-center ${events.down ? 'bg-primary border-primary shadow-lg shadow-primary/20' : 'bg-black/40 border-white/10 group-hover:border-white/20'}`}>
                        {events.down && <Check className="w-3.5 h-3.5 text-black font-bold" />}
                    </div>
                    <span className="text-sm text-gray-300">Notify when <span className="text-error font-medium">DOWN 🔴</span></span>
                </div>
            </div>

            <div className="flex justify-end items-center gap-4 pt-4 border-t border-white/5">
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isLoading}
                        className="px-6 py-2.5 text-sm font-medium text-gray-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                )}
                <button
                    type="submit"
                    disabled={isLoading}
                    className="flex items-center gap-2 px-8 py-2.5 bg-primary text-black rounded-xl text-sm font-bold hover:bg-primary-hover active:scale-95 transition-all shadow-lg shadow-primary/10 disabled:opacity-50"
                >
                    {isLoading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                        <Check className="w-4 h-4" />
                    )}
                    {isLoading ? 'Saving...' : 'Save Channel'}
                </button>
            </div>
        </form>
    );
}

export function NotificationConfigModal({ isOpen, onClose }: NotificationConfigModalProps) {
    const [channels, setChannels] = useState<NotificationChannel[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<'list' | 'add' | 'history' | 'maintenance'>('list');
    const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
    const [deleteChannel, setDeleteChannel] = useState<{ id: string, name: string } | null>(null);

    // Alert History & Maintenance Silence State
    const [historyLogs, setHistoryLogs] = useState<any[]>([]);
    const [maintenanceConfig, setMaintenanceConfig] = useState<{ maintenanceMode: boolean; mutedNamespaces: string[]; mutedServices: string[] }>({
        maintenanceMode: false,
        mutedNamespaces: [],
        mutedServices: []
    });
    const [newMutedNs, setNewMutedNs] = useState('');

    const { hasRole } = useAuth();
    const { addToast } = useToast();
    const isAdmin = hasRole('kubiq-admin');

    const fetchChannels = async () => {
        try {
            setIsLoading(true);
            const data = await apiClient.getNotificationChannels();
            setChannels(data);
        } catch (err) {
            setError('Failed to load notification channels');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchHistory = async () => {
        try {
            const data = await apiClient.getNotificationHistory();
            setHistoryLogs(data || []);
        } catch {
            setHistoryLogs([]);
        }
    };

    const fetchMaintenance = async () => {
        try {
            const data = await apiClient.getMaintenanceConfig();
            setMaintenanceConfig(data || { maintenanceMode: false, mutedNamespaces: [], mutedServices: [] });
        } catch {
            // fallback
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchChannels();
            fetchHistory();
            fetchMaintenance();
        }
    }, [isOpen]);

    const handleCreate = async (data: any) => {
        if (!isAdmin) {
            addToast('Access Denied: Only admins can create channels', 'error');
            return;
        }
        setError('');
        setIsLoading(true);

        try {
            await apiClient.createNotificationChannel(data);
            await fetchChannels();
            setActiveTab('list');
            addToast('Channel created successfully!', 'success');
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to create channel');
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdate = async (id: string, data: any) => {
        if (!isAdmin) {
            addToast('Access Denied: Only admins can update channels', 'error');
            return;
        }
        setError('');
        setIsLoading(true);
        try {
            await apiClient.updateNotificationChannel(id, data);
            await fetchChannels();
            setEditingChannelId(null);
            addToast('Channel updated successfully!', 'success');
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to update channel');
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggle = async (channel: NotificationChannel) => {
        if (!isAdmin) {
            addToast('Access Denied: Only admins can enable/disable channels', 'error');
            return;
        }
        try {
            // Optimistic update
            setChannels(channels.map(c => c.id === channel.id ? { ...c, enabled: !channel.enabled } : c));

            await apiClient.updateNotificationChannel(channel.id, {
                ...channel,
                enabled: !channel.enabled
            });
            addToast(`Channel ${!channel.enabled ? 'enabled' : 'disabled'}`, 'success');
        } catch (err) {
            // Revert on failure
            fetchChannels();
            addToast('Failed to update channel status', 'error');
        }
    };

    const initiateDelete = (channel: { id: string, name: string }) => {
        if (!isAdmin) {
            addToast('Access Denied: Only admins can delete channels', 'error');
            return;
        }
        setDeleteChannel(channel);
    }

    const confirmDelete = async () => {
        if (!deleteChannel || !isAdmin) return;
        try {
            await apiClient.deleteNotificationChannel(deleteChannel.id);
            setDeleteChannel(null);
            fetchChannels();
            addToast('Channel deleted', 'success');
        } catch (err) {
            setError('Failed to delete channel');
        }
    };

    const handleTest = async (id: string) => {
        try {
            await apiClient.testNotificationChannel(id);
            addToast('Test notification sent! 🚀', 'success');
            fetchHistory();
        } catch (err: any) {
            addToast(`Test failed: ${err.response?.data?.message}`, 'error');
        }
    };

    const initiateEdit = (id: string) => {
        if (!isAdmin) {
            addToast('Access Denied: Only admins can edit channels', 'error');
            return;
        }
        setEditingChannelId(id);
    }

    const handleToggleMaintenance = async () => {
        if (!isAdmin) return;
        try {
            const updated = await apiClient.updateMaintenanceConfig({
                maintenanceMode: !maintenanceConfig.maintenanceMode
            });
            setMaintenanceConfig(updated);
            addToast(`Global maintenance silence mode ${!maintenanceConfig.maintenanceMode ? 'ENABLED 🔇' : 'DISABLED 🔔'}`, 'success');
        } catch {
            addToast('Failed to toggle maintenance mode', 'error');
        }
    };

    const handleAddMutedNs = async () => {
        if (!newMutedNs.trim() || !isAdmin) return;
        const nsList = Array.from(new Set([...maintenanceConfig.mutedNamespaces, newMutedNs.trim()]));
        try {
            const updated = await apiClient.updateMaintenanceConfig({ mutedNamespaces: nsList });
            setMaintenanceConfig(updated);
            setNewMutedNs('');
            addToast(`Muted namespace: ${newMutedNs.trim()}`, 'success');
        } catch {
            addToast('Failed to mute namespace', 'error');
        }
    };

    const handleRemoveMutedNs = async (ns: string) => {
        if (!isAdmin) return;
        const nsList = maintenanceConfig.mutedNamespaces.filter(x => x !== ns);
        try {
            const updated = await apiClient.updateMaintenanceConfig({ mutedNamespaces: nsList });
            setMaintenanceConfig(updated);
            addToast(`Unmuted namespace: ${ns}`, 'success');
        } catch {
            addToast('Failed to unmute namespace', 'error');
        }
    };

    const handleClearHistory = async () => {
        if (!isAdmin) return;
        try {
            await apiClient.clearNotificationHistory();
            setHistoryLogs([]);
            addToast('Alert history cleared', 'success');
        } catch {
            addToast('Failed to clear alert history', 'error');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-bg-surface rounded-xl border border-gray-800 shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-hide">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-800 sticky top-0 bg-bg-surface z-10">
                    <div className="flex items-center gap-2">
                        <Bell className="w-5 h-5 text-blue-500" />
                        <h2 className="text-xl font-bold text-white">Notification Center</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4">
                    {/* Tabs */}
                    <div className="flex gap-4 mb-6 border-b border-gray-800 text-xs sm:text-sm overflow-x-auto">
                        <button
                            onClick={() => setActiveTab('list')}
                            className={`pb-2 px-1 shrink-0 ${activeTab === 'list' ? 'text-blue-500 border-b-2 border-blue-500 font-medium' : 'text-gray-400 hover:text-white'}`}
                        >
                            Active Channels ({channels.length})
                        </button>
                        {isAdmin && (
                            <button
                                onClick={() => setActiveTab('add')}
                                className={`pb-2 px-1 shrink-0 ${activeTab === 'add' ? 'text-blue-500 border-b-2 border-blue-500 font-medium' : 'text-gray-400 hover:text-white'}`}
                            >
                                Add Channel
                            </button>
                        )}
                        <button
                            onClick={() => { setActiveTab('history'); fetchHistory(); }}
                            className={`pb-2 px-1 shrink-0 flex items-center gap-1.5 ${activeTab === 'history' ? 'text-blue-500 border-b-2 border-blue-500 font-medium' : 'text-gray-400 hover:text-white'}`}
                        >
                            <span>Alert History</span>
                        </button>
                        <button
                            onClick={() => { setActiveTab('maintenance'); fetchMaintenance(); }}
                            className={`pb-2 px-1 shrink-0 flex items-center gap-1.5 ${activeTab === 'maintenance' ? 'text-amber-500 border-b-2 border-amber-500 font-medium' : 'text-gray-400 hover:text-white'}`}
                        >
                            <span>Silence & Maintenance</span>
                            {maintenanceConfig.maintenanceMode && <span className="bg-amber-500/20 text-amber-400 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase">Muted</span>}
                        </button>
                    </div>

                    {error && (
                        <div className="mb-4 bg-error/10 border border-error text-error px-4 py-2 rounded flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    )}

                    {activeTab === 'list' && (
                        <div className="space-y-3">
                            {channels.length === 0 && (
                                <div className="text-center py-8 text-gray-500">
                                    No notification channels configured. {isAdmin ? 'Add one to get alerts!' : 'Contact admin to configure.'}
                                </div>
                            )}
                            {channels.map(channel => (
                                <div key={channel.id} className="transition-all duration-200">
                                    {editingChannelId === channel.id ? (
                                        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                                            <ChannelForm
                                                initialValues={channel}
                                                onSubmit={(data) => handleUpdate(channel.id, data)}
                                                onCancel={() => setEditingChannelId(null)}
                                                isLoading={isLoading}
                                            />
                                        </div>
                                    ) : (
                                        <div className="bg-bg-elevated border border-gray-800 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 overflow-hidden">
                                            <div className="flex items-center gap-3 sm:gap-4 min-w-0 w-full sm:w-auto">
                                                {/* Toggle Switch */}
                                                <button
                                                    onClick={() => handleToggle(channel)}
                                                    className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-gray-900 ${channel.enabled ? 'bg-green-500' : 'bg-red-500/50'
                                                        } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                    title={!isAdmin ? 'Access Denied' : (channel.enabled ? 'Disable Channel' : 'Enable Channel')}
                                                >
                                                    <span
                                                        className={`${channel.enabled ? 'translate-x-6' : 'translate-x-1'
                                                            } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                                                    />
                                                </button>

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <h3 className={`font-semibold truncate ${channel.enabled ? 'text-text' : 'text-gray-500 line-through'}`}>{channel.name}</h3>
                                                        <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300 uppercase shrink-0">{channel.type}</span>
                                                    </div>
                                                    <div className="text-xs sm:text-sm text-text-dim truncate">
                                                        {channel.type === 'webhook' ? channel.config.webhookUrl : channel.config.email}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 shrink-0 justify-end sm:justify-start">
                                                <button
                                                    onClick={() => initiateEdit(channel.id)}
                                                    className={`p-2 hover:bg-gray-700 rounded-lg transition-colors ${!isAdmin ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-blue-500'}`}
                                                    title={!isAdmin ? "Access Denied" : "Edit Channel"}
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleTest(channel.id)}
                                                    className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-green-500 transition-colors"
                                                    title="Send Test Alert"
                                                >
                                                    <Send className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => initiateDelete({ id: channel.id, name: channel.name })}
                                                    className={`p-2 hover:bg-gray-700 rounded-lg transition-colors ${!isAdmin ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-red-500'}`}
                                                    title={!isAdmin ? "Access Denied" : "Delete Channel"}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'add' && isAdmin && (
                        <ChannelForm onSubmit={handleCreate} isLoading={isLoading} />
                    )}

                    {activeTab === 'history' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between pb-2 border-b border-gray-800">
                                <span className="text-xs text-gray-400">Recent alert dispatches across all channels</span>
                                {isAdmin && historyLogs.length > 0 && (
                                    <button
                                        onClick={handleClearHistory}
                                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                                    >
                                        Clear History
                                    </button>
                                )}
                            </div>
                            {historyLogs.length === 0 ? (
                                <div className="text-center py-8 text-gray-500 text-sm">
                                    No alert history logged yet. Dispatched alerts will show up here!
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-96 overflow-y-auto">
                                    {historyLogs.map(item => (
                                        <div key={item.id} className="bg-bg-elevated border border-gray-800 rounded-lg p-3 text-xs space-y-1">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${item.delivered ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                        }`}>
                                                        {item.delivered ? 'DELIVERED' : 'SUPPRESSED / FAILED'}
                                                    </span>
                                                    <span className="font-semibold text-white">{item.title}</span>
                                                </div>
                                                <span className="text-gray-500 text-[10px]">
                                                    {new Date(item.timestamp).toLocaleString()}
                                                </span>
                                            </div>
                                            <div className="text-gray-400 flex items-center justify-between">
                                                <span>Channel: <strong className="text-gray-300">{item.channelName}</strong> ({item.channelType})</span>
                                                {item.target && <span className="font-mono text-gray-400">Target: {item.target}</span>}
                                            </div>
                                            {item.error && (
                                                <div className="text-amber-400 text-[11px] bg-amber-500/10 p-1.5 rounded border border-amber-500/20">
                                                    Reason: {item.error}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'maintenance' && (
                        <div className="space-y-6">
                            {/* Global Maintenance Toggle */}
                            <div className="bg-bg-elevated border border-gray-800 rounded-xl p-4 flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-white text-sm">Global Maintenance Mode</h3>
                                        {maintenanceConfig.maintenanceMode ? (
                                            <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] px-2 py-0.5 rounded font-bold uppercase">Active</span>
                                        ) : (
                                            <span className="bg-green-500/20 text-green-400 border border-green-500/30 text-[10px] px-2 py-0.5 rounded font-bold uppercase">Disabled</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1">
                                        When active, all alert dispatches across all webhooks and email channels are silenced.
                                    </p>
                                </div>
                                <button
                                    onClick={handleToggleMaintenance}
                                    disabled={!isAdmin}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${maintenanceConfig.maintenanceMode
                                        ? 'bg-amber-500 text-black hover:bg-amber-400'
                                        : 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10'
                                        } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    {maintenanceConfig.maintenanceMode ? 'Disable Maintenance Mode' : 'Enable Maintenance Silence'}
                                </button>
                            </div>

                            {/* Namespace Muting */}
                            <div className="bg-bg-elevated border border-gray-800 rounded-xl p-4 space-y-3">
                                <div>
                                    <h3 className="font-bold text-white text-sm">Muted Kubernetes Namespaces</h3>
                                    <p className="text-xs text-gray-400 mt-0.5">Silence alerts for specific namespaces (e.g. <code className="text-primary font-mono">staging</code>, <code className="text-primary font-mono">dev</code>)</p>
                                </div>

                                {isAdmin && (
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="Enter namespace to mute..."
                                            value={newMutedNs}
                                            onChange={e => setNewMutedNs(e.target.value)}
                                            className="bg-black/30 border border-gray-700 text-xs text-white rounded-xl px-3 py-2 flex-1 focus:outline-none focus:border-primary"
                                        />
                                        <button
                                            onClick={handleAddMutedNs}
                                            className="px-3 py-2 bg-primary/20 text-primary border border-primary/30 rounded-xl text-xs font-semibold hover:bg-primary/30 transition-colors"
                                        >
                                            Mute Namespace
                                        </button>
                                    </div>
                                )}

                                <div className="flex flex-wrap gap-2 pt-1">
                                    {maintenanceConfig.mutedNamespaces.length === 0 ? (
                                        <span className="text-xs text-gray-500 italic">No namespaces currently muted.</span>
                                    ) : (
                                        maintenanceConfig.mutedNamespaces.map(ns => (
                                            <span key={ns} className="inline-flex items-center gap-1.5 bg-gray-800 border border-gray-700 text-gray-200 text-xs px-2.5 py-1 rounded-lg font-mono">
                                                <span>{ns}</span>
                                                {isAdmin && (
                                                    <button onClick={() => handleRemoveMutedNs(ns)} className="text-gray-400 hover:text-red-400 transition-colors">
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </span>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                {/* Delete Confirmation Dialog */}
                <ConfirmDialog
                    isOpen={!!deleteChannel}
                    onClose={() => setDeleteChannel(null)}
                    onConfirm={confirmDelete}
                    title="Delete Channel"
                    message={`Are you sure you want to delete the channel "${deleteChannel?.name}"? This action cannot be undone.`}
                    confirmText="Delete"
                    cancelText="Cancel"
                    type="danger"
                />
            </div>
        </div>
    );
}
