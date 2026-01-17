
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, Globe, Layout, Clock, Save } from 'lucide-react';
import { apiClient } from '../services/api';

interface StatusPageConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StatusPageConfigModal({ isOpen, onClose }: StatusPageConfigModalProps) {
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('System Status');
  const [refreshInterval, setRefreshInterval] = useState(300);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialSlug, setInitialSlug] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const config = await apiClient.getStatusPageConfig();
      setSlug(config.slug || '');
      setTitle(config.title);
      setRefreshInterval(config.refreshInterval);
      setInitialSlug(config.slug);
    } catch (error) {
      console.error('Failed to load status config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient.updateStatusPageConfig({
        slug: slug || null, // Empty string means disabled/null
        title,
        refreshInterval,
      });
      onClose();
    } catch (error) {
      console.error('Failed to save status config:', error);
      alert('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  // Dynamic base URL detection
  let pathPrefix = import.meta.env.BASE_URL;
  if (!pathPrefix.endsWith('/')) pathPrefix += '/';

  const currentPath = window.location.pathname;
  if (currentPath.includes('/dashboard')) {
      const prefix = currentPath.substring(0, currentPath.indexOf('/dashboard'));
      pathPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
      if (pathPrefix === '') pathPrefix = '/';
  }

  const publicUrl = slug ? `${window.location.origin}${pathPrefix}status/${slug}` : null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl scale-100 animate-in zoom-in-95 duration-200 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4">
          <h2 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
             Public Status Page
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 pt-2 space-y-6">
          {loading ? (
             <div className="py-12 flex flex-col items-center justify-center text-gray-500 gap-3">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p>Loading configuration...</p>
             </div>
          ) : (
            <>
              <div className="space-y-4">
                 {/* Title Input */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-400 ml-1">
                    Page Title
                  </label>
                  <div className="relative group">
                     <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors">
                        <Layout className="w-5 h-5" />
                     </div>
                     <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                      placeholder="e.g. System Status"
                      required
                     />
                  </div>
                </div>

                {/* Slug Input */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-400 ml-1">
                    URL Slug
                  </label>
                  <div className="flex rounded-xl overflow-hidden border border-white/10 group focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary/50 transition-all">
                     <div className="bg-white/5 px-3 py-3 text-gray-500 text-sm border-r border-white/10 flex items-center gap-2">
                        <Globe className="w-4 h-4" />
                        <span className="hidden xs:inline">/status/</span>
                     </div>
                     <input
                       type="text"
                       value={slug}
                       onChange={(e) => setSlug(e.target.value)}
                       className="flex-1 bg-black/20 px-3 py-3 text-white placeholder:text-gray-600 focus:outline-none min-w-0"
                       placeholder="my-status-page"
                     />
                  </div>
                  <p className="text-xs text-gray-500 ml-1">Leave empty to disable public access.</p>
                </div>

                {/* Refresh Interval */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-400 ml-1">
                    Refresh Interval (seconds)
                  </label>
                  <div className="relative group">
                     <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors">
                        <Clock className="w-5 h-5" />
                     </div>
                     <input
                      type="number"
                      value={refreshInterval}
                      onChange={(e) => setRefreshInterval(parseInt(e.target.value) || 300)}
                      min="10"
                      className="w-full bg-black/20 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all appearance-none"
                     />
                  </div>
                </div>

                {/* Public Link Preview */}
                {publicUrl && (
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-between group cursor-pointer hover:bg-blue-500/20 transition-colors">
                    <div className="truncate text-xs text-blue-300 mr-2 flex items-center gap-2">
                       <ExternalLink className="w-4 h-4" />
                       <span className="truncate">{publicUrl}</span>
                    </div>
                    <a
                      href={publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 text-blue-400 hover:text-white transition-colors p-1"
                      title="Open Public Page"
                    >
                      Open
                    </a>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-transparent border border-white/10 hover:bg-white/5 text-gray-300 rounded-xl font-medium transition-all duration-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || saving}
              className="flex-1 px-4 py-2.5 bg-primary hover:bg-blue-600 text-white rounded-xl font-medium shadow-lg shadow-blue-500/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? (
                 <>
                   <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                   Saving...
                 </>
              ) : (
                 <>
                   <Save className="w-4 h-4" />
                   {initialSlug ? 'Update Page' : 'Create Page'}
                 </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
