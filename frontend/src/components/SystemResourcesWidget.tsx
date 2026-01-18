
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* CPU Widget */}
            <div className="bg-bg-card border border-border-color rounded-lg p-5 flex items-center shadow-lg backdrop-blur-sm bg-opacity-80">
                <div className="mr-4">
                    <div className="relative w-16 h-16">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-gray-700" />
                            <circle 
                                cx="32" cy="32" r="28" 
                                stroke="currentColor" strokeWidth="4" 
                                fill="transparent" 
                                className={`${metrics.cpuLoad > 80 ? 'text-red-500' : 'text-blue-500'} transition-all duration-1000 ease-in-out`}
                                strokeDasharray={175} 
                                strokeDashoffset={175 - (metrics.cpuLoad / 100) * 175} 
                            />
                        </svg>
                        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                            <span className="text-sm font-bold text-white">{Math.round(metrics.cpuLoad)}%</span>
                        </div>
                    </div>
                </div>
                <div>
                    <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-1 flex items-center">
                        <Cpu className="w-4 h-4 mr-2" /> CPU Load
                    </h3>
                    <p className="text-emerald-400 text-xs">System Active</p>
                </div>
            </div>

            {/* RAM Widget */}
            <div className="bg-bg-card border border-border-color rounded-lg p-5 flex flex-col justify-center shadow-lg backdrop-blur-sm bg-opacity-80">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider flex items-center">
                        <Activity className="w-4 h-4 mr-2" /> Memory
                    </h3>
                    <span className="text-white font-mono text-sm">
                        {formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)}
                    </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2.5 overflow-hidden">
                    <div 
                        className={`h-2.5 rounded-full ${memPercent > 80 ? 'bg-red-500 animate-pulse' : 'bg-purple-500'}`} 
                        style={{ width: `${memPercent}%`, transition: 'width 0.5s ease-out' }}
                    ></div>
                </div>
                <p className="text-right text-xs text-gray-500 mt-2">{Math.round(memPercent)}% Used</p>
            </div>

            {/* Uptime Widget */}
            <div className="bg-bg-card border border-border-color rounded-lg p-5 flex items-center justify-between shadow-lg backdrop-blur-sm bg-opacity-80">
                <div>
                    <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-2 flex items-center">
                        <Clock className="w-4 h-4 mr-2" /> Uptime
                    </h3>
                    <div className="flex space-x-1">
                        {formatUptime(metrics.uptime).split(' ').map((part, i) => (
                            <div key={i} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white font-mono text-lg font-bold">
                                {part}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
