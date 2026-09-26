import { useState } from 'react';
import { ShieldAlert, Copy, Check, Terminal, Lock } from 'lucide-react';
import { copyToClipboard } from '../utils/k8sHelpers';

interface K8sRbacPermissionBannerProps {
    resource: string;
    namespace?: string;
    message?: string;
    onRetry?: () => void;
}

const RESOURCE_RBAC_MAP: Record<string, { apiGroup: string; verb: string }> = {
    pods: { apiGroup: '""', verb: 'get, list, watch' },
    deployments: { apiGroup: '"apps"', verb: 'get, list, watch' },
    services: { apiGroup: '""', verb: 'get, list, watch' },
    endpoints: { apiGroup: '""', verb: 'get, list, watch' },
    ingresses: { apiGroup: '"networking.k8s.io"', verb: 'get, list, watch' },
    persistentvolumes: { apiGroup: '""', verb: 'get, list, watch' },
    persistentvolumeclaims: { apiGroup: '""', verb: 'get, list, watch' },
    storageclasses: { apiGroup: '"storage.k8s.io"', verb: 'get, list, watch' },
    configmaps: { apiGroup: '""', verb: 'get, list, watch' },
    secrets: { apiGroup: '""', verb: 'get, list, watch' },
    nodes: { apiGroup: '""', verb: 'get, list, watch' },
    events: { apiGroup: '""', verb: 'get, list, watch' },
    'pods/exec': { apiGroup: '""', verb: 'get, create' },
    'pods/log': { apiGroup: '""', verb: 'get' }
};

export function K8sRbacPermissionBanner({ resource, namespace = 'cluster', message, onRetry }: K8sRbacPermissionBannerProps) {
    const [copied, setCopied] = useState(false);
    const rbacMeta = RESOURCE_RBAC_MAP[resource.toLowerCase()] || { apiGroup: '""', verb: 'get, list, watch' };

    const yamlSnippet = `# Add to rules in ClusterRole "kubiq-observer" (deploy/kubernetes/kubiq-system.yaml):
- apiGroups: [${rbacMeta.apiGroup}]
  resources: ["${resource}"]
  verbs: [${rbacMeta.verb.split(', ').map(v => `"${v}"`).join(', ')}]`;

    const handleCopy = () => {
        copyToClipboard(yamlSnippet);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[#111111] overflow-y-auto custom-scrollbar h-full font-sans">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4 text-red-400 shadow-lg shadow-red-500/5">
                <ShieldAlert className="w-8 h-8 animate-pulse" />
            </div>

            <div className="inline-flex items-center gap-2 text-[10px] font-mono font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-full uppercase tracking-wider mb-3">
                <Lock className="w-3 h-3" />
                <span>403 Forbidden • ClusterRole Permission Required</span>
            </div>

            <h3 className="text-xl font-bold text-white mb-2">
                RBAC Permission Lacking: <span className="text-red-400 font-mono capitalize">{resource}</span>
            </h3>

            <p className="text-xs text-gray-400 max-w-lg mb-6 leading-relaxed">
                The kubiq ServiceAccount <code className="text-red-300 font-mono bg-red-950/30 px-1.5 py-0.5 rounded border border-red-500/20">system:serviceaccount:kubiq-system:kubiq</code> does not have permission to access resource <code className="text-white font-bold font-mono">{resource}</code> in namespace <code className="text-primary font-bold font-mono">{namespace}</code>.
            </p>

            {message && (
                <div className="w-full max-w-xl bg-red-950/20 border border-red-500/20 rounded-xl p-3 text-left font-mono text-[11px] text-red-300/90 mb-5 break-all leading-relaxed">
                    <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider block mb-1">K8s API Error:</span>
                    {message}
                </div>
            )}

            {/* Solution snippet box */}
            <div className="w-full max-w-xl bg-[#161616] border border-white/10 rounded-xl p-4 text-left font-mono text-xs text-gray-300 shadow-xl relative group">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                    <div className="flex items-center gap-1.5 text-gray-400">
                        <Terminal className="w-3.5 h-3.5 text-primary" />
                        <span>Fix in ClusterRole (deploy/kubernetes/kubiq-system.yaml)</span>
                    </div>
                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-1 text-primary hover:text-white transition-colors bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded border border-primary/20"
                    >
                        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copied ? 'Copied!' : 'Copy Rule'}</span>
                    </button>
                </div>
                <pre className="text-emerald-400 font-mono text-[11px] leading-relaxed overflow-x-auto custom-scrollbar p-1">
                    {yamlSnippet}
                </pre>
            </div>

            <div className="mt-5 flex flex-col sm:flex-row items-center gap-3">
                <span className="text-[11px] text-gray-400">
                    Run command: <code className="text-white font-mono bg-black/60 px-2 py-1 rounded border border-white/10 select-all">kubectl apply -f deploy/kubernetes/kubiq-system.yaml</code>
                </span>
                {onRetry && (
                    <button
                        onClick={onRetry}
                        className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 px-3 py-1 rounded text-xs font-semibold transition-colors uppercase tracking-wider"
                    >
                        Retry Fetch
                    </button>
                )}
            </div>
        </div>
    );
}
