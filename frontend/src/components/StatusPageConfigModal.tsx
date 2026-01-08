import { useState, useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';
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

  // Dynamic base URL detection to handle deployment inconsistencies
  // We try to detect the context path from the current URL if possible
  let pathPrefix = import.meta.env.BASE_URL;
  if (!pathPrefix.endsWith('/')) pathPrefix += '/';

  // If we are on the dashboard, we can accurately determine the prefix
  // independent of build-time constants (which might differ in some setups)
  const currentPath = window.location.pathname;
  if (currentPath.includes('/dashboard')) {
      // Extract everything before /dashboard
      const prefix = currentPath.substring(0, currentPath.indexOf('/dashboard'));
      // Normalize to ensure trailing slash
      pathPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
      // Handle the case where prefix might be empty string (root)
      if (pathPrefix === '') pathPrefix = '/';
  }

  const publicUrl = slug ? `${window.location.origin}${pathPrefix}status/${slug}` : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-bg-surface border border-gray-700 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-bg-elevated">
          <h2 className="text-lg font-semibold text-text">Public Status Page</h2>
          <button onClick={onClose} className="text-text-dim hover:text-text transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 space-y-4">
          {loading ? (
            <div className="py-8 text-center text-text-dim">Loading configuration...</div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-text-dim mb-1">
                  Page Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-bg rounded-lg border border-gray-700 text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="e.g. System Status"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-dim mb-1">
                  URL Slug
                </label>
                <div className="flex items-center">
                  <span className="text-text-dim text-sm mr-2 bg-bg-elevated px-2 py-2 rounded-l-lg border border-r-0 border-gray-700 whitespace-nowrap">
                    {pathPrefix}status/
                  </span>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className="flex-1 px-3 py-2 bg-bg rounded-r-lg border border-gray-700 text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary min-w-0"
                    placeholder="my-status-page"
                  />
                </div>
                <p className="text-xs text-text-dim mt-1">
                  Leave empty to disable the public status page.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-dim mb-1">
                  Refresh Interval (seconds)
                </label>
                <input
                  type="number"
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(parseInt(e.target.value) || 300)}
                  min="10"
                  className="w-full px-3 py-2 bg-bg rounded-lg border border-gray-700 text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {publicUrl && (
                <div className="p-3 bg-bg-elevated rounded-lg border border-gray-700 flex items-center justify-between">
                  <div className="truncate text-xs text-text-dim mr-2">
                    {publicUrl}
                  </div>
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 text-primary hover:text-primary/80"
                    title="Open Public Page"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}
            </>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-dim hover:text-text hover:bg-bg-elevated rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || saving}
              className="px-4 py-2 text-sm bg-primary hover:bg-primary/80 text-white rounded-lg transition-colors font-medium disabled:opacity-50"
            >
              {saving ? 'Saving...' : initialSlug ? 'Update Page' : 'Create Page'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
