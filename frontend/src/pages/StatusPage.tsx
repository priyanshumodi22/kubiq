import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Settings, RefreshCw, AlertCircle, Clock } from 'lucide-react';
import { apiClient } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';

interface PublicService {
  name: string;
  currentStatus: 'healthy' | 'unhealthy' | 'unknown';
  history: Array<{
    timestamp: number;
    responseTime: number;
    success: boolean;
    status: number;
  }>;
}

interface PageData {
  pageTitle: string;
  refreshInterval: number;
  services: PublicService[];
  lastUpdated: string;
}

export default function StatusPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Admin Edit State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editInterval, setEditInterval] = useState(300);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = useCallback(async () => {
    if (!slug) return;
    try {
      setIsRefreshing(true);
      const result = await apiClient.getPublicStatus(slug);
      setData(result);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load status page:', err);
      setError(err.response?.status === 404 ? 'Status page not found or disabled.' : 'Failed to load status page.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (!data?.refreshInterval) return;
    const interval = setInterval(fetchData, data.refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [data?.refreshInterval, fetchData]);

  const handleEditOpen = async () => {
    try {
      const config = await apiClient.getStatusPageConfig();
      setEditTitle(config.title);
      setEditSlug(config.slug || '');
      setEditInterval(config.refreshInterval);
      setShowEditModal(true);
    } catch (e) {
      console.error('Failed to fetch config for editing', e);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const newConfig = await apiClient.updateStatusPageConfig({
        slug: editSlug,
        title: editTitle,
        refreshInterval: editInterval,
      });
      setShowEditModal(false);
      if (newConfig.slug !== slug) {
        navigate(`/status/${newConfig.slug}`);
      } else {
        fetchData();
      }
    } catch (e) {
      console.error('Failed to save config', e);
      alert('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-4">
        <div className="text-error mb-4">
          <AlertCircle className="w-12 h-12" />
        </div>
        <h1 className="text-2xl font-bold text-text mb-2">Unavailable</h1>
        <p className="text-text-dim">{error}</p>
        {isAuthenticated && (
          <button
             onClick={() => navigate('/dashboard')}
             className="mt-6 px-4 py-2 bg-bg-elevated text-text hover:text-primary rounded-lg transition-colors"
          >
            Go to Dashboard
          </button>
        )}
      </div>
    );
  }

  if (!data) return null;

  return (
    <Layout>
      <div className="relative">
        {/* Background Effects */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          {/* Gradient base */}
          <div className="absolute inset-0 bg-gradient-to-br from-bg via-bg to-bg-surface"></div>
          {/* Radial gradient overlay */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.05),transparent_50%)]"></div>
          {/* Blur orbs */}
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
          <div className="absolute top-1/3 -right-20 w-80 h-80 bg-primary/3 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 left-1/4 w-72 h-72 bg-primary/4 rounded-full blur-3xl"></div>
        </div>

        <div className="max-w-5xl mx-auto w-full space-y-6">
        {/* Page Header Area */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-6">
          <h1 className="text-3xl font-bold text-text">{data.pageTitle}</h1>
          
          <div className="flex items-center gap-4">
            <div className="text-sm text-text-dim flex items-center gap-1.5 bg-bg-surface px-3 py-1.5 rounded-full border border-gray-800">
               <Clock className="w-3.5 h-3.5" />
               <span className="hidden sm:inline">Updated:</span>
               <span className="font-mono">{new Date(data.lastUpdated).toLocaleTimeString()}</span>
            </div>
            
            <div className="flex items-center gap-2">
              {isAuthenticated && (
                <button
                  onClick={handleEditOpen}
                  className="p-2 text-text-dim hover:text-primary hover:bg-bg-elevated rounded-lg transition-colors border border-transparent hover:border-gray-700"
                  title="Page Settings"
                >
                  <Settings className="w-5 h-5" />
                </button>
              )}
              <button
                 onClick={fetchData}
                 disabled={isRefreshing}
                 className={`p-2 text-text-dim hover:text-primary hover:bg-bg-elevated rounded-lg transition-colors border border-transparent hover:border-gray-700 ${isRefreshing ? 'animate-spin' : ''}`}
                 title="Refresh Status"
              >
                 <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex items-center gap-4">
           <div className="relative flex-1">
              <input
                 type="text"
                 placeholder="Search services..."
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="w-full bg-bg-surface border border-gray-800 rounded-lg pl-3 pr-4 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
              />
           </div>
        </div>

        {/* Services List */}
        <div className="space-y-3">
          {data.services
             .filter(service => service.name.toLowerCase().includes(searchQuery.toLowerCase()))
             .map((service) => {
               // Filter history to last 1 hour
               const oneHourAgo = Date.now() - 60 * 60 * 1000; 
               // Ensure we have at least one check to avoid total collision
               const recentHistory = service.history.filter(h => h.timestamp > oneHourAgo);
               
               // Calculate downtime incidents for the footer label
               const downtimeCount = recentHistory.filter(h => !h.success).length;

               const uptime = recentHistory.length > 0 
                  ? (recentHistory.filter(h => h.success).length / recentHistory.length) * 100 
                  : 100;

               return (
                  <div key={service.name} className="bg-bg-elevated rounded-xl p-4 border border-gray-800 hover:border-gray-700 transition-colors shadow-lg">
                    {/* Header: Name + Uptime and Status Badge */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-baseline gap-3">
                        <h3 className="text-lg font-semibold text-text tracking-tight">{service.name}</h3>
                        <span className={`text-sm font-bold ${
                             uptime >= 98 ? 'text-success' : uptime >= 90 ? 'text-warning' : 'text-error'
                         }`}>
                           {uptime.toFixed(1)}%
                        </span>
                      </div>
                      <div className={`text-xs font-bold uppercase tracking-wider ${
                           service.currentStatus === 'healthy' ? 'text-success' : 'text-error'
                       }`}>
                           {service.currentStatus === 'healthy' ? 'NOMINAL' : 'CRITICAL'}
                      </div>
                    </div>

                    {/* Simple Line Visualization */}
                    <div className="w-full relative py-1">
                       {/* Container for the line segments */}
                       <div className="flex items-center w-full h-3 gap-[2px]">
                           {recentHistory.map((check, idx) => (
                              <div key={idx} className="group relative flex-1 h-full flex items-center">
                                 {/* The Line Segment */}
                                 <div 
                                    className={`w-full rounded-full transition-all duration-300 ${
                                       check.success 
                                          ? 'h-[2px] bg-success' 
                                          : 'h-2.5 bg-error shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                                    }`}
                                 />
                                 
                                 {/* Tooltip on Hover */}
                                 <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 hidden group-hover:block z-20 whitespace-nowrap pointer-events-none">
                                    <div className="bg-gray-900/95 backdrop-blur text-xs text-text border border-gray-700 rounded-lg px-3 py-2 shadow-xl transform transition-all">
                                       <div className={`font-bold mb-1 flex items-center gap-2 ${check.success ? 'text-success' : 'text-error'}`}>
                                          <div className={`w-1.5 h-1.5 rounded-full ${check.success ? 'bg-success' : 'bg-error'}`}></div>
                                          {uptime.toFixed(1)}% Uptime
                                       </div>
                                       <div className="text-text-dim font-mono mb-0 text-[10px] uppercase tracking-wider">
                                          {new Date(check.timestamp).toLocaleDateString()} • {new Date(check.timestamp).toLocaleTimeString()}
                                       </div>
                                    </div>
                                    {/* Arrow */}
                                    <div className="w-2 h-2 bg-gray-900 border-r border-b border-gray-700 transform rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2"></div>
                                 </div>
                              </div>
                           ))}
                           {recentHistory.length === 0 && (
                              <div className="w-full h-[2px] bg-gray-800 rounded-full flex items-center justify-center">
                              </div>
                           )}
                       </div>
                       
                       {/* Minimalist Footer Info */}
                       <div className="flex items-center justify-between text-[10px] font-medium text-text-dim mt-2">
                          <div>
                            Last 1 hr
                          </div>
                          
                          {downtimeCount > 0 && (
                            <div className="flex items-center gap-1.5 text-text-dim">
                               <AlertCircle className="w-3 h-3 text-error" />
                               <span>{downtimeCount} Incidents reported</span>
                            </div>
                          )}
                          {downtimeCount === 0 && (
                            <div className="opacity-0">Placeholder</div>
                          )}
                       </div>
                    </div>
                  </div>
               );
          })}
        </div>
      </div>

      {/* Edit Modal (reused from previous, updated styling context as needed) */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-bg-surface rounded-xl border border-gray-800 w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-text mb-4">Edit Status Page</h2>
            <div className="space-y-4">
               <div>
                  <label className="block text-xs font-semibold text-text-dim mb-1">Page Title</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-bg rounded-lg border border-gray-700 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
               </div>
               <div>
                  <label className="block text-xs font-semibold text-text-dim mb-1">URL Slug</label>
                  <div className="flex items-center">
                     <span className="text-text-dim text-sm mr-2 bg-bg-elevated px-2 py-2 rounded-l-lg border border-r-0 border-gray-700">/status/</span>
                     <input
                       type="text"
                       value={editSlug}
                       onChange={e => setEditSlug(e.target.value)}
                       className="flex-1 px-3 py-2 bg-bg rounded-r-lg border border-gray-700 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                     />
                  </div>
               </div>
               <div>
                  <label className="block text-xs font-semibold text-text-dim mb-1">Refresh Interval (seconds)</label>
                  <input
                    type="number"
                    value={editInterval}
                    onChange={e => setEditInterval(parseInt(e.target.value))}
                    min="10"
                    className="w-full px-3 py-2 bg-bg rounded-lg border border-gray-700 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
               </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
               <button
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-sm text-text-dim hover:text-text hover:bg-bg-elevated rounded-lg transition-colors"
               >
                  Cancel
               </button>
               <button
                  onClick={handleSaveConfig}
                  disabled={saving || !editSlug.trim()}
                  className="px-4 py-2 text-sm bg-primary hover:bg-primary/80 disabled:opacity-50 rounded-lg font-medium transition-colors text-white"
               >
                  {saving ? 'Saving...' : 'Save Changes'}
               </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </Layout>
  );
}
