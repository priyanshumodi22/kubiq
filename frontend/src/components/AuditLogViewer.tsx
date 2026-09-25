import { useState, useEffect } from 'react';
import { Shield, Search, RefreshCw } from 'lucide-react';
import { apiClient } from '../services/api';

export interface AuditLogItem {
    id: string;
    timestamp: string;
    user: string;
    action: string;
    target: string;
    details?: string;
    ip?: string;
}

export function AuditLogViewer() {
    const [logs, setLogs] = useState<AuditLogItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const res = await apiClient.getAuditLogs(search);
            setLogs(res || []);
        } catch (e) {
            console.error('Failed to fetch audit logs:', e);
            setLogs([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [search]);

    const getActionBadge = (action: string) => {
        switch (action) {
            case 'TTY_EXEC':
                return <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded text-[10px] font-mono font-bold">TTY Exec</span>;
            case 'MANIFEST_APPLY':
                return <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded text-[10px] font-mono font-bold">Apply Manifest</span>;
            case 'DEPLOYMENT_SCALE':
                return <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[10px] font-mono font-bold">Scale Workload</span>;
            case 'DEPLOYMENT_RESTART':
                return <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded text-[10px] font-mono font-bold">Restart Rollout</span>;
            case 'RESOURCE_DELETE':
                return <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded text-[10px] font-mono font-bold">Delete Resource</span>;
            case 'AUTH_LOGIN':
                return <span className="bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded text-[10px] font-mono font-bold">Auth Login</span>;
            default:
                return <span className="bg-gray-500/10 text-gray-400 border border-gray-500/20 px-2 py-0.5 rounded text-[10px] font-mono font-bold">{action}</span>;
        }
    };

    return (
        <div className="bg-[#14161b] border border-gray-800 rounded-2xl overflow-hidden shadow-2xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-gray-800 pb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 border border-primary/20 rounded-xl text-primary">
                        <Shield className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white">Immutable Security Audit Logs</h2>
                        <p className="text-xs text-gray-400 font-mono">Administrative actions, manifest deployments, and TTY sessions</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                        <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Filter by user, action, target..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="bg-black/30 border border-gray-700 text-xs text-white rounded-xl pl-9 pr-3 py-2 w-full focus:outline-none focus:border-primary/50"
                        />
                    </div>
                    <button
                        onClick={fetchLogs}
                        className="p-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl border border-white/10 transition-colors"
                        title="Refresh audit log stream"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="py-16 flex flex-col items-center justify-center space-y-3">
                    <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                    <span className="text-xs text-gray-500 font-mono">Loading audit logs...</span>
                </div>
            ) : logs.length === 0 ? (
                <div className="py-16 text-center text-gray-500 font-mono text-xs">
                    No administrative audit events recorded yet.
                </div>
            ) : (
                <div className="overflow-x-auto border border-gray-800/80 rounded-xl">
                    <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-black/40 text-gray-400 border-b border-gray-800">
                            <tr>
                                <th className="px-4 py-3 font-semibold">Timestamp</th>
                                <th className="px-4 py-3 font-semibold">User</th>
                                <th className="px-4 py-3 font-semibold">Action</th>
                                <th className="px-4 py-3 font-semibold">Target Resource</th>
                                <th className="px-4 py-3 font-semibold">Details</th>
                                <th className="px-4 py-3 font-semibold">IP Address</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/50">
                            {logs.map((log) => (
                                <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                                        {new Date(log.timestamp).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-white font-bold whitespace-nowrap">
                                        {log.user}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        {getActionBadge(log.action)}
                                    </td>
                                    <td className="px-4 py-3 text-primary truncate max-w-xs font-semibold">
                                        {log.target}
                                    </td>
                                    <td className="px-4 py-3 text-gray-300 max-w-sm truncate">
                                        {log.details || '—'}
                                    </td>
                                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                                        {log.ip || 'local'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
