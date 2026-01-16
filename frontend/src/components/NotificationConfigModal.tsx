import React, { useState, useEffect } from 'react';
import { X, Trash2, Bell, Check, AlertCircle, Send } from 'lucide-react';
import { apiClient } from '../services/api';

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
  };
  enabled: boolean;
  events: {
    up: boolean;
    down: boolean;
  };
}

export function NotificationConfigModal({ isOpen, onClose }: NotificationConfigModalProps) {
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list');

  // Form State
  const [name, setName] = useState('');
  const [type, setType] = useState<'webhook' | 'email'>('webhook');
  const [config, setConfig] = useState<any>({});
  const [events, setEvents] = useState({ up: true, down: true });

  // UI Feedback State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

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

  useEffect(() => {
    if (isOpen) {
      fetchChannels();
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await apiClient.createNotificationChannel({
        name,
        type,
        config,
        events,
        enabled: true
      });
      await fetchChannels();
      setActiveTab('list');
      // Reset form
      setName('');
      setConfig({});
      showToast('Channel created successfully! 🎉', 'success');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create channel');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this channel?')) return;
    try {
      await apiClient.deleteNotificationChannel(id);
      fetchChannels();
      showToast('Channel deleted', 'success');
    } catch (err) {
      setError('Failed to delete channel');
    }
  };

  const handleTest = async (id: string) => {
    try {
      await apiClient.testNotificationChannel(id);
      showToast('Test notification sent! 🚀', 'success');
    } catch (err: any) {
      showToast(`Test failed: ${err.response?.data?.message}`, 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-200 ${
          toast.type === 'success' ? 'bg-green-500/90 text-white' : 'bg-red-500/90 text-white'
        }`}>
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      <div className="bg-bg-surface rounded-xl border border-gray-800 shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 sticky top-0 bg-bg-surface z-10">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-500" />
            <h2 className="text-xl font-bold text-white">Notification Channels</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          {/* Tabs */}
          <div className="flex gap-4 mb-6 border-b border-gray-800">
            <button
              onClick={() => setActiveTab('list')}
              className={`pb-2 px-1 ${activeTab === 'list' ? 'text-blue-500 border-b-2 border-blue-500 font-medium' : 'text-gray-400 hover:text-white'}`}
            >
              Active Channels
            </button>
            <button
              onClick={() => setActiveTab('add')}
              className={`pb-2 px-1 ${activeTab === 'add' ? 'text-blue-500 border-b-2 border-blue-500 font-medium' : 'text-gray-400 hover:text-white'}`}
            >
              Add New Channel
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
                  No notification channels configured. Add one to get alerts!
                </div>
              )}
              {channels.map(channel => (
                <div key={channel.id} className="bg-bg-elevated border border-gray-800 rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-text">{channel.name}</h3>
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300 uppercase">{channel.type}</span>
                    </div>
                    <div className="text-sm text-text-dim truncate max-w-md">
                      {channel.type === 'webhook' ? channel.config.webhookUrl : channel.config.email}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleTest(channel.id)}
                      className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-blue-500 transition-colors"
                      title="Send Test Alert"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(channel.id)}
                      className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                      title="Delete Channel"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'add' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Friendly Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. DevOps Slack"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Type</label>
                <select
                  value={type}
                  onChange={e => setType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                >
                  <option value="webhook">Webhook (Slack/Teams/Discord)</option>
                  <option value="email">Email (SMTP)</option>
                </select>
              </div>

              {type === 'webhook' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Webhook URL</label>
                  <input
                    type="url"
                    required
                    value={config.webhookUrl || ''}
                    onChange={e => setConfig({ ...config, webhookUrl: e.target.value })}
                    placeholder="https://hooks.slack.com/services/..."
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                  <p className="mt-1 text-xs text-text-dim">Works with Slack, Discord, MS Teams, Google Chat</p>
                </div>
              )}

              {type === 'email' && (
                <div className="space-y-3 p-3 border border-gray-800 rounded-lg bg-gray-900/50">
                  <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Recipient Email(s)</label>
                <input
                  type="text"
                  value={config.email || ''}
                  onChange={e => setConfig({ ...config, email: e.target.value })}
                  placeholder="email1@example.com, email2@example.com"
                  className="w-full bg-bg-surface border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary placeholder-gray-600"
                />
                <p className="text-xs text-gray-500 mt-1">Separate multiple addresses with commas</p>
              </div>
                  <div className="grid grid-cols-2 gap-3">
                     <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">SMTP Host</label>
                        <input
                          type="text"
                          required
                          value={config.smtpHost || ''}
                          onChange={e => setConfig({ ...config, smtpHost: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">SMTP Port</label>
                        <input
                          type="number"
                          required
                          value={config.smtpPort || 587}
                          onChange={e => setConfig({ ...config, smtpPort: parseInt(e.target.value) })}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                        />
                     </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                     <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Username (Optional)</label>
                        <input
                          type="text"
                          value={config.smtpUser || ''}
                          onChange={e => setConfig({ ...config, smtpUser: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Password (Optional)</label>
                        <input
                          type="password"
                          value={config.smtpPass || ''}
                          onChange={e => setConfig({ ...config, smtpPass: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                        />
                     </div>
                  </div>
                </div>
              )}

              <div className="flex gap-4 pt-2">
                 <div className="flex items-center gap-2">
                    <input 
                        type="checkbox" 
                        id="eventUp"
                        checked={events.up}
                        onChange={e => setEvents({...events, up: e.target.checked})}
                        className="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"
                    />
                    <label htmlFor="eventUp" className="text-sm text-gray-300">Notify when UP ✅</label>
                 </div>
                 <div className="flex items-center gap-2">
                    <input 
                        type="checkbox" 
                        id="eventDown"
                        checked={events.down}
                        onChange={e => setEvents({...events, down: e.target.checked})}
                        className="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"
                    />
                    <label htmlFor="eventDown" className="text-sm text-gray-300">Notify when DOWN 🔴</label>
                 </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  {isLoading ? 'Saving...' : <><Check className="w-4 h-4" /> Save Channel</>}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
