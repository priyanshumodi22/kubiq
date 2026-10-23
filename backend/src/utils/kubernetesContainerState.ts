import type { V1ContainerState } from '@kubernetes/client-node';

export function getContainerState(state?: V1ContainerState): 'running' | 'waiting' | 'terminated' | 'unknown' {
    if (state?.running) return 'running';
    if (state?.waiting) return 'waiting';
    if (state?.terminated) return 'terminated';
    return 'unknown';
}
