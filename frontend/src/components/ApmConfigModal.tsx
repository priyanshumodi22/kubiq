import { useState, useEffect } from 'react';
import { X, Settings, AlertCircle, Save } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

interface ApmConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ApmConfigModal({ isOpen, onClose }: ApmConfigModalProps) {
  const [ignoredRoutesStr, setIgnoredRoutesStr] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      fetchConfig();
    }
  }, [isOpen]);

  const fetchConfig = async () => {
    try {
      setIsLoading(true);
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const ctxPath = import.meta.env.VITE_BACKEND_CONTEXT_PATH || '';
      
      const token = localStorage.getItem('kubiq_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${baseUrl}${ctxPath}/api/system/apm-config`, {
        headers
      });
      
      if (!res.ok) throw new Error('Failed to fetch APM config');
      const data = await res.json();
      
      if (data.ignoredRoutes && Array.isArray(data.ignoredRoutes)) {
        setIgnoredRoutesStr(data.ignoredRoutes.join(', '));
      }
    } catch (error) {
      console.error(error);
      addToast('Failed to load APM configuration', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const ctxPath = import.meta.env.VITE_BACKEND_CONTEXT_PATH || '';
      
      const ignoredRoutes = ignoredRoutesStr
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const token = localStorage.getItem('kubiq_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${baseUrl}${ctxPath}/api/system/apm-config`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ ignoredRoutes })
      });

      if (!res.ok) throw new Error('Failed to save APM config');
      
      addToast('APM configuration saved successfully', 'success');
      onClose();
    } catch (error) {
      console.error(error);
      addToast('Failed to save APM configuration', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="bg-bg-surface border border-gray-800 rounded-xl shadow-2xl w-full max-w-lg relative z-10 animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
              <Settings className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">APM Configuration</h2>
              <p className="text-sm text-gray-400">Manage global tracing rules and ingestion dropping</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-6">
          
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-300">
              <p className="font-medium text-blue-200 mb-1">Ingestion Dropping</p>
              Traces that match these HTTP routes will be dropped immediately upon arrival to save database storage. Useful for ignoring health checks and metrics endpoints.
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Ignored HTTP Routes
            </label>
            {isLoading ? (
              <div className="animate-pulse bg-gray-800 h-10 rounded-lg w-full"></div>
            ) : (
              <input
                type="text"
                value={ignoredRoutesStr}
                onChange={(e) => setIgnoredRoutesStr(e.target.value)}
                placeholder="/health, /metrics, /favicon.ico"
                className="w-full bg-bg border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary/50 transition-colors"
              />
            )}
            <p className="text-xs text-gray-500 mt-2">
              Comma-separated list of route substrings to ignore (e.g. <span className="font-mono text-gray-400">/health, /ping</span>).
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-gray-800 flex justify-end gap-3 bg-bg-surface/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-300 hover:text-white bg-transparent hover:bg-white/5 border border-transparent rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 font-medium"
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}
