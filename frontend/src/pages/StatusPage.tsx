import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Settings, RefreshCw, AlertCircle, Clock, CheckCircle, AlertTriangle, XCircle, Share2, Check } from 'lucide-react';
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
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
              <button
                 onClick={handleShare}
                 className="p-2 text-text-dim hover:text-primary hover:bg-bg-elevated rounded-lg transition-colors border border-transparent hover:border-gray-700 relative"
                 title="Copy Link"
              >
                 {copied ? <Check className="w-5 h-5 text-success" /> : <Share2 className="w-5 h-5" />}
              </button>
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

        {/* Overall Status Banner */}
        {(() => {
           const criticalCount = data.services.filter(s => s.currentStatus === 'unhealthy').length;
           // Approximate calculation for banner degraded state (using raw checks if needed or just skip logic for perf)
           // Let's stick to current status count for speed, or partial calc.
           // A service requires detailed history loop for precise uptime. Let's do a quick calc.
           const degradedCount = data.services.filter(s => {
               if (s.currentStatus === 'unhealthy') return false;
               const rec = s.history.slice(-120); // Last ~1 hour
               const up = rec.length > 0 ? (rec.filter(x => x.success).length / rec.length) : 1;
               return up < 0.9;
           }).length;

           if (criticalCount > 0) {
               return (
                  <div className="bg-error/10 border border-error/50 rounded-xl p-6 flex items-start gap-4">
                      <XCircle className="w-8 h-8 text-error shrink-0" />
                      <div>
                          <h2 className="text-xl font-bold text-error">Major System Outage</h2>
                          <p className="text-text-dim mt-1">Some systems are currently experiencing critical issues. Our team is investigating.</p>
                      </div>
                  </div>
               );
           } else if (degradedCount > 0) {
               return (
                  <div className="bg-warning/10 border border-warning/50 rounded-xl p-6 flex items-start gap-4">
                      <AlertTriangle className="w-8 h-8 text-warning shrink-0" />
                      <div>
                          <h2 className="text-xl font-bold text-warning">Partial System Outage</h2>
                          <p className="text-text-dim mt-1">Some services are experiencing degraded performance.</p>
                      </div>
                  </div>
               );
           } else {
               return (
                  <div className="bg-success/10 border border-success/50 rounded-xl p-6 flex items-center gap-4">
                      <CheckCircle className="w-8 h-8 text-success shrink-0" />
                      <div>
                          <h2 className="text-xl font-bold text-success">All Systems Operational</h2>
                          <p className="text-text-dim mt-1">All services are functioning normally.</p>
                      </div>
                  </div>
               );
           }
        })()}

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
               // Filter history to last 24 hours
               const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000; 
               const fullHistory = service.history.filter(h => h.timestamp > oneDayAgo);
               
               // Calculate stats from full history (up to 24h)
               const downtimeCount = fullHistory.filter(h => !h.success).length;
               const uptime = fullHistory.length > 0 
                  ? (fullHistory.filter(h => h.success).length / fullHistory.length) * 100 
                  : 100;

               const isCritical = service.currentStatus !== 'healthy';
               const isDegraded = !isCritical && uptime < 90; // If currently UP but historically bad (<90%)
               
               let statusLabel = 'NOMINAL';
               let statusColorClazz = 'text-success';
               
               if (isCritical) {
                   statusLabel = 'CRITICAL';
                   statusColorClazz = 'text-error';
               } else if (isDegraded) {
                   statusLabel = 'DEGRADED';
                   statusColorClazz = 'text-warning'; 
               }

               // Aggregation Logic for Visualization
               // Divide timeline into 60 blocks (each represents ~24 mins if full 24h)
               const BARS = 60;
               const now = Date.now();
               // We want fixed start time? No, relative to now is better for rolling window
               // Bin size = 24h / 60 = 24 minutes per bar
               const WINDOW = 24 * 60 * 60 * 1000;
               const binSize = WINDOW / BARS;
               const timelineStart = now - WINDOW;

               const aggregatedBars = [];
               if (fullHistory.length === 0) {
                   // Render empty line if no data
                   aggregatedBars.push({ empty: true });
               } else {
                   for (let i = 0; i < BARS; i++) {
                       const binStart = timelineStart + (i * binSize);
                       const binEnd = binStart + binSize;
                       // Find checks in this bin
                       const checks = fullHistory.filter(h => h.timestamp >= binStart && h.timestamp < binEnd);
                       
                       if (checks.length === 0) {
                           // No checks in this specific 24min window?
                           // If it's in the past (before data collection started), it's unknown/empty.
                           // If it's effectively "now" but empty, handle gracefully.
                           // For now, push nothing or a specific 'no-data' block?
                           // To keep alignment, we push 'empty'.
                           aggregatedBars.push({ 
                               empty: true, 
                               timestamp: binStart 
                           });
                       } else {
                           // Analyze bin
                           const failures = checks.filter(c => !c.success);
                           const isFailure = failures.length > 0;
                           const avgResponse = checks.reduce((a, b) => a + b.responseTime, 0) / checks.length;
                           
                           aggregatedBars.push({
                               empty: false,
                               success: !isFailure, // If ANY failure, mark bin as red
                               count: checks.length,
                               failureCount: failures.length,
                               avgResponse,
                               timestamp: binStart,
                               // Use the last check in bin for detailed error if any
                               lastError: failures.length > 0 ? failures[failures.length-1].status : null
                           });
                       }
                   }
               }
               
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
                      <div className={`text-xs font-bold uppercase tracking-wider ${statusColorClazz}`}>
                           {statusLabel}
                      </div>
                    </div>

                    {/* Simple Line Visualization */}
                    <div className="w-full relative py-1">
                       {/* Container for the line segments */}
                       <div className="flex items-center w-full h-3 gap-[2px]">
                           {aggregatedBars.map((bar, idx) => {
                               if (bar.empty) {
                                   return (
                                       <div key={idx} className="flex-1 h-[2px] bg-gray-800/50 rounded-full" />
                                   );
                               }
                               return (
                                  <div key={idx} className="group relative flex-1 h-full flex items-center">
                                     {/* The Line Segment */}
                                     {/* If 24h view, bars are small. */}
                                     <div 
                                        className={`w-full rounded-full transition-all duration-300 ${
                                           bar.success 
                                              ? 'h-[2px] bg-success' 
                                              : 'h-2.5 bg-error shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                                        }`}
                                     />
                                     
                                     {/* Tooltip on Hover */}
                                     <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 hidden group-hover:block z-20 whitespace-nowrap pointer-events-none">
                                        <div className="bg-gray-900/95 backdrop-blur text-xs text-text border border-gray-700 rounded-lg px-3 py-2 shadow-xl transform transition-all">
                                          <div className={`font-bold mb-1 flex items-center gap-2 ${bar.success ? 'text-success' : 'text-error'}`}>
                                             <div className={`w-1.5 h-1.5 rounded-full ${bar.success ? 'bg-success' : 'bg-error'}`}></div>
                                             {bar.success ? (
                                                 <span className="flex items-center gap-2">
                                                     Operational
                                                     <span className="text-text-dim font-normal border-l border-gray-700 pl-2 ml-1 text-[10px] font-mono">
                                                         ~{Math.round(bar.avgResponse!)}ms
                                                     </span>
                                                 </span>
                                             ) : (
                                                 <span className="flex items-center gap-2">
                                                     Downtime/Degraded
                                                 </span>
                                             )}
                                          </div>
                                          <div className="text-text-dim font-mono mb-0 text-[10px] uppercase tracking-wider">
                                             {new Date(bar.timestamp!).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                             {' - '}
                                             {new Date(bar.timestamp! + binSize).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                          </div>
                                       </div>
                                       {/* Arrow */}
                                       <div className="w-2 h-2 bg-gray-900 border-r border-b border-gray-700 transform rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2"></div>
                                    </div>
                                 </div>
                              );
                           })}
                       </div>
                       
                       {/* Minimalist Footer Info */}
                       <div className="flex items-center justify-between text-[10px] font-medium text-text-dim mt-2">
                          <div>
                            Past 24 Hours
                          </div>
                          
                          {downtimeCount > 0 && (
                            <div className="flex items-center gap-1.5 text-text-dim">
                               <AlertCircle className="w-3 h-3 text-error" />
                               <span>{downtimeCount} checks failed</span>
                            </div>
                          )}
                          {downtimeCount === 0 && (
                            <div className="flex items-center gap-1.5 text-success/80">
                               <CheckCircle className="w-3 h-3" />
                               <span>100% Uptime</span>
                            </div>
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
