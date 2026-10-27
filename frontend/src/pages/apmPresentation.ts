import type { ServiceMetrics } from '../hooks/useApm';

export function measurementLabel(service: ServiceMetrics): string {
    return service.measurementBasis === 'server-requests' ? 'Server requests' : 'Legacy spans';
}

export function throughputUnit(service: ServiceMetrics): string {
    return service.measurementBasis === 'server-requests' ? 'requests/min' : 'spans/min';
}

export function latencyLabel(percentile: string): string {
    switch (percentile) {
        case 'p50': return 'P50 Latency (Median)';
        case 'p90': return 'P90 Latency';
        case 'p95': return 'P95 Latency (Standard)';
        case 'p99': return 'P99 Latency (Tail SRE)';
        default: return 'P95 Latency';
    }
}

export function latencyValue(service: ServiceMetrics, percentile: string): number {
    switch (percentile) {
        case 'p50': return service.p50DurationMs || service.avgDurationMs;
        case 'p90': return service.p90DurationMs || service.p95DurationMs * 0.9;
        case 'p99': return service.p99DurationMs || service.p95DurationMs * 1.2;
        default: return service.p95DurationMs;
    }
}

export function exportDurationLabel(duration: number): string {
    switch (duration) {
        case 0: return 'Any Duration';
        case 100: return '> 100ms';
        case 500: return '> 500ms';
        case 1000: return '> 1s';
        case 2000: return '> 2s';
        default: return '> 5s';
    }
}

export function serviceErrorClass(isRed: boolean, isYellow: boolean): string {
    if (isRed) return 'text-red-400 font-bold';
    if (isYellow) return 'text-amber-400 font-bold';
    return 'text-green-400';
}
