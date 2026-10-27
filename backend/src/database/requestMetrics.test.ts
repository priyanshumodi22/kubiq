import { expect, test } from '@jest/globals';
import { selectRequestMetrics, durationP95 } from './requestMetrics';

const server = { serviceName: 'api', isServer: true, requestCount: 2, errorCount: 1, avgDurationMs: 120, p95DurationMs: 200 };
const children = { serviceName: 'api', isServer: false, requestCount: 15, errorCount: 10, avgDurationMs: 10, p95DurationMs: 15 };
const legacy = { ...children, serviceName: 'legacy' };
test.each([[server, children, legacy], [children, legacy, server]])('SERVER metrics replace dependency totals regardless of adapter row ordering', (...rows) => {
    const result = selectRequestMetrics(rows);
    expect(result.find(row => row.serviceName === 'api')).toEqual({ serviceName: 'api', requestCount: 2, errorCount: 1, avgDurationMs: 120, p95DurationMs: 200, measurementBasis: 'server-requests' });
    expect(result.find(row => row.serviceName === 'legacy')).toEqual({ serviceName: 'legacy', requestCount: 15, errorCount: 10, avgDurationMs: 10, p95DurationMs: 15, measurementBasis: 'legacy-spans' });
});
test.each([1, '1', true])('supports database SERVER group flag %p', isServer => {
    expect(selectRequestMetrics([{ ...server, isServer }])[0].measurementBasis).toBe('server-requests');
});
test('an empty time window has no invented requests', () => { expect(selectRequestMetrics([])).toEqual([]); });

test('request P95 selects the upper exact quantile while legacy ranks remain unchanged', () => {
 expect(durationP95([30,10],true)).toBe(30);
 expect(durationP95([30,10],false)).toBe(10);
 expect(durationP95([],true)).toBe(0);
 expect(durationP95([10],true)).toBe(10);
});
