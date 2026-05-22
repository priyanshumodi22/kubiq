
import { useEffect, useState } from 'react';
import { Cpu, Activity, Clock } from 'lucide-react';
import { apiClient } from '../services/api';
import { SystemMetrics } from '../types';

export const SystemResourcesWidget = () => {
    const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchStats = async () => {
        try {
            const data = await apiClient.getSystemStats();
            setMetrics(data);
            setLoading(false);
        } catch (error) {
            console.error('Failed to fetch system stats:', error);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
        const interval = setInterval(fetchStats, 5000); // Poll every 5 seconds
        return () => clearInterval(interval);
    }, []);

    // Animation trigger
    const [animate, setAnimate] = useState(false);
    useEffect(() => {
        if (!loading && metrics) {
             // Small delay to ensure render happens at 0 first (if we were mounted)
             // or just to trigger the transition class change
             requestAnimationFrame(() => {
                 setAnimate(true);
             });
        }
    }, [loading, metrics]);

    if (loading || !metrics) {
        return <div className="animate-pulse h-32 bg-gray-900 rounded-lg"></div>;
    }

    const formatUptime = (seconds: number) => {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${days}d ${hours}h ${minutes}m`;
    };

    const formatBytes = (bytes: number) => {
        const gb = bytes / (1024 * 1024 * 1024);
        return `${gb.toFixed(1)} GB`;
    };

    // Calculate memory percentage
    const memPercent = (metrics.memory.used / metrics.memory.total) * 100;

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-6">
            {/* CPU Widget */}
            <div className="col-span-1 bg-bg-card border border-border-color rounded-lg p-3 sm:p-5 flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left shadow-lg backdrop-blur-sm bg-opacity-80 animate-premium-fade" style={{ animationDelay: '0ms' }}>
                <div className="sm:mr-4 mb-2 sm:mb-0">
                    <div className="relative w-12 h-12 sm:w-16 sm:h-16 mx-auto">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle cx="50%" cy="50%" r="45%" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-gray-700" />
                            <circle 
                                cx="50%" cy="50%" r="45%" 
                                stroke="currentColor" strokeWidth="4" 
                                fill="transparent" 
                                className={`${metrics.cpuLoad > 80 ? 'text-red-500' : 'text-blue-500'} transition-all duration-1000 ease-out`}
                                strokeDasharray={175} 
                                strokeDashoffset={animate ? 175 - (metrics.cpuLoad / 100) * 175 : 175} 
                            />
                        </svg>
                        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                            <span className="text-xs sm:text-sm font-bold text-white">{Math.round(metrics.cpuLoad)}%</span>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col justify-center">
                    <h3 className="text-gray-400 text-[10px] sm:text-sm font-medium uppercase tracking-wider mb-1 flex items-center justify-center sm:justify-start whitespace-nowrap">
                        <Cpu className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> CPU Load
                    </h3>
                    <p className="text-emerald-400 text-[9px] sm:text-xs whitespace-nowrap">System Active</p>
                </div>
            </div>

            {/* Uptime Widget - Moved up for mobile layout */}
            <div className="col-span-1 bg-bg-card border border-border-color rounded-lg p-3 sm:p-5 flex flex-col items-center sm:items-start justify-center shadow-lg backdrop-blur-sm bg-opacity-80 animate-premium-fade" style={{ animationDelay: '200ms' }}>
                <div className="w-full text-center sm:text-left">
                    <h3 className="text-gray-400 text-[10px] sm:text-sm font-medium uppercase tracking-wider mb-2 flex items-center justify-center sm:justify-start whitespace-nowrap">
                        <Clock className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> Uptime
                    </h3>
                    <div className="flex space-x-1 justify-center sm:justify-start">
                        {formatUptime(metrics.uptime).split(' ').map((part, i) => (
                            <div key={i} className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 sm:px-2 sm:py-1 text-white font-mono text-xs sm:text-lg font-bold">
                                {part}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* RAM Widget - Spans full width on mobile */}
            <div className="col-span-2 md:col-span-1 bg-bg-card border border-border-color rounded-lg p-4 sm:p-5 flex flex-col justify-center shadow-lg backdrop-blur-sm bg-opacity-80 animate-premium-fade" style={{ animationDelay: '100ms' }}>
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-gray-400 text-xs sm:text-sm font-medium uppercase tracking-wider flex items-center">
                        <Activity className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> Memory
                    </h3>
                    <span className="text-white font-mono text-xs sm:text-sm">
                        {formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)}
                    </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2 sm:h-2.5 overflow-hidden">
                    <div 
                        className={`h-full rounded-full ${memPercent > 80 ? 'bg-red-500 animate-pulse' : 'bg-purple-500'}`} 
                        style={{ width: `${animate ? memPercent : 0}%`, transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)' }}
                    ></div>
                </div>
                <p className="text-right text-[10px] sm:text-xs text-gray-500 mt-2">{Math.round(memPercent)}% Used</p>
            </div>
        </div>
    );
};
