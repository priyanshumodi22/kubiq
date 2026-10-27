import { IServiceMetrics } from './interfaces/ITraceRepository';

export function isServerGroup(value: boolean | number | string): boolean {
    return value === true || value === 1 || value === '1';
}

/** SERVER P95 uses the exact upper quantile; retain the previous legacy rank. */
export function durationP95(durations: number[], server: boolean | number | string): number {
    const sorted = [...durations].sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const rank = Math.floor(sorted.length * 0.95) - (isServerGroup(server) ? 0 : 1);
    return sorted[Math.max(0, Math.min(sorted.length - 1, rank))];
}

/** Each adapter aggregates separately by service and SERVER/non-SERVER kind. */
export function selectRequestMetrics(rows: (IServiceMetrics & { isServer: boolean | number | string })[]): IServiceMetrics[] {
    const services = new Map<string, IServiceMetrics>();
    for (const { isServer, ...row } of rows) {
        const server = isServerGroup(isServer);
        if (server || !services.has(row.serviceName)) {
            services.set(row.serviceName, { ...row, measurementBasis: server ? 'server-requests' : 'legacy-spans' });
        }
    }
    return [...services.values()];
}
