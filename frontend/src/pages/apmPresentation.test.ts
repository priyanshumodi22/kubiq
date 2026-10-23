import { describe, expect, it } from 'vitest';
import { exportDurationLabel, latencyLabel, latencyValue, serviceErrorClass } from './apmPresentation';

const service = { serviceName: 'payments', requestCount: 1, errorCount: 0, avgDurationMs: 10, p95DurationMs: 100, rpm: 1, errorRate: 0 };

describe('APM presentation compatibility', () => {
    it('preserves percentile fallbacks, including legacy zero-value behavior', () => {
        expect(latencyValue(service, 'p50')).toBe(10);
        expect(latencyValue({ ...service, p50DurationMs: 0 }, 'p50')).toBe(10);
        expect(latencyValue({ ...service, p50DurationMs: 5 }, 'p50')).toBe(5);
        expect(latencyValue(service, 'p90')).toBe(90);
        expect(latencyValue(service, 'p99')).toBe(120);
        expect(latencyValue(service, 'p95')).toBe(100);
        expect(latencyValue(service, 'unknown')).toBe(100);
    });
    it('retains percentile labels and unsupported-value fallbacks', () => {
        expect(latencyLabel('p50')).toBe('P50 Latency (Median)');
        expect(latencyLabel('p90')).toBe('P90 Latency');
        expect(latencyLabel('p95')).toBe('P95 Latency (Standard)');
        expect(latencyLabel('p99')).toBe('P99 Latency (Tail SRE)');
        expect(latencyLabel('unknown')).toBe('P95 Latency');
    });
    it('preserves duration labels and error severity precedence', () => {
        expect([0, 100, 500, 1000, 2000, 5000].map(exportDurationLabel)).toEqual(['Any Duration', '> 100ms', '> 500ms', '> 1s', '> 2s', '> 5s']);
        expect(serviceErrorClass(true, true)).toBe('text-red-400 font-bold');
        expect(serviceErrorClass(false, true)).toBe('text-amber-400 font-bold');
        expect(serviceErrorClass(false, false)).toBe('text-green-400');
    });
});
