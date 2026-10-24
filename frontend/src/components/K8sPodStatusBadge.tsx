
export interface K8sPodStatusBadgeProps {
    status: string | { phase?: string; reason?: string } | null | undefined;
    isTerminating?: boolean;
}

export function K8sPodStatusBadge({ status, isTerminating }: Readonly<K8sPodStatusBadgeProps>) {
    const rawStatus = typeof status === 'string' ? status : status?.phase || status?.reason || 'Active';
    let color = 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    const label = isTerminating ? 'Terminating' : rawStatus;

    const s = String(rawStatus || '').toLowerCase();
    
    if (isTerminating) {
        color = 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    } else if (s.includes('running') || s.includes('completed')) {
        color = 'bg-green-500/10 text-green-400 border-green-500/20';
    } else if (s.includes('pending') || s.includes('containercreating') || s.includes('podinitializing')) {
        color = 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
    } else if (s.includes('error') || s.includes('fail') || s.includes('crash') || s.includes('backoff') || s.includes('imagepull') || s.includes('evicted')) {
        color = 'bg-red-500/10 text-red-400 border-red-500/20';
    }

    const isRunning = s.includes('running') && !isTerminating;
    const inactiveDot = isTerminating ? 'animate-pulse bg-orange-400' : 'bg-current';
    const dotClass = isRunning ? 'animate-pulse bg-green-400' : inactiveDot;

    return (
        <div className={`px-2 py-0.5 rounded-full border text-[10px] font-medium inline-flex items-center gap-1.5 ${color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
            {label}
        </div>
    );
}
