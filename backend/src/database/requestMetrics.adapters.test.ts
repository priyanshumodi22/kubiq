import { afterEach, expect, jest, test } from '@jest/globals';
import mysql from 'mysql2/promise';
import { MongoTraceRepository } from './adapters/mongo/MongoTraceRepository';
import { MysqlTraceRepository } from './adapters/mysql/MysqlTraceRepository';
import { ClickhouseTraceRepository } from './adapters/clickhouse/ClickhouseTraceRepository';
import { ApmSpanModel } from './schemas/ApmSpanSchema';
import { clickhouseService } from '../services/ClickhouseService';

jest.mock('mysql2/promise', () => ({ __esModule: true, default: { createPool: jest.fn() } }));
afterEach(() => { jest.restoreAllMocks(); });
const groups = [
    { serviceName: 'api', isServer: 0, requestCount: 9, errorCount: 8, avgDurationMs: 1, durations: Array(9).fill(1), p95DurationMs: 1 },
    { serviceName: 'api', isServer: 1, requestCount: 2, errorCount: 1, avgDurationMs: 20, durations: [10, 30], p95DurationMs: 30 },
    { serviceName: 'old', isServer: 0, requestCount: 1, errorCount: 0, avgDurationMs: 5, durations: [5], p95DurationMs: 5 },
];
const expected = [
    { serviceName: 'api', requestCount: 2, errorCount: 1, avgDurationMs: 20, p95DurationMs: 30, measurementBasis: 'server-requests' },
    { serviceName: 'old', requestCount: 1, errorCount: 0, avgDurationMs: 5, p95DurationMs: 5, measurementBasis: 'legacy-spans' },
];
test('MongoDB aggregates numeric and named SERVER kinds independently before selecting requests', async () => {
    const aggregate = jest.spyOn(ApmSpanModel, 'aggregate').mockResolvedValue(groups);
    expect(await new MongoTraceRepository().getServiceMetrics(0, 1000)).toEqual(expected);
    const pipeline = JSON.stringify(aggregate.mock.calls[0][0]);
    for (const kind of ['2', 'SERVER', 'SPAN_KIND_SERVER']) expect(pipeline).toContain(kind);
    expect(pipeline).toContain('$_id.isServer');
    expect(aggregate.mock.calls[0][0]?.[0]).toEqual({ $match: { timestamp: { $gte: new Date(0), $lte: new Date(1000) } } });
});
test.each(['mysql', 'mariadb'])('%s preserves bound time windows and separates request and dependency groups', async () => {
    const rows = groups.map(row => ({ ...row, durations: row.durations.join(',') }));
    const query = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValueOnce([]).mockResolvedValueOnce([rows]);
    jest.mocked(mysql.createPool).mockReturnValue({ getConnection: async () => ({ query, release: () => {} }) } as unknown as ReturnType<typeof mysql.createPool>);
    expect(await new MysqlTraceRepository().getServiceMetrics(0, 1000)).toEqual(expected);
    expect(query.mock.calls[1][0]).toContain('GROUP BY service_name, isServer');
    expect(query.mock.calls[1][0]).toContain("('2', 'SERVER', 'SPAN_KIND_SERVER')");
    expect(query.mock.calls[1][1]).toEqual([new Date(0), new Date(1000)]);
});
test('ClickHouse applies the same per-service selection and binds the time range', async () => {
    const query = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ json: async () => groups });
    jest.spyOn(clickhouseService, 'getClient').mockReturnValue({ query } as unknown as ReturnType<typeof clickhouseService.getClient>);
    jest.spyOn(clickhouseService, 'getDatabase').mockReturnValue('default');
    expect(await new ClickhouseTraceRepository().getServiceMetrics(0, 1000)).toEqual(expected);
    expect(query.mock.calls[0][0]).toEqual(expect.objectContaining({ query: expect.stringContaining('GROUP BY serviceName, isServer'), query_params: { from: '1970-01-01 00:00:00', to: '1970-01-01 00:00:01' } }));
});
test('span insert errors retain identity without logging span payloads or credentials', async () => {
    const error = Object.assign(new Error('SYNTHETIC_SECRET'), { code: 42, writeErrors: ['SYNTHETIC_SECRET'] });
    jest.spyOn(ApmSpanModel.collection, 'insertMany').mockRejectedValue(error);
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const spans = [{ serviceName: 'api', spanId: 's', traceId: 't', name: 'SYNTHETIC_SECRET', startTimeUnixNano: 0, endTimeUnixNano: 1, durationMs: 1 }];
    await expect(new MongoTraceRepository().insertSpans(spans)).rejects.toBe(error);
    expect(JSON.stringify(log.mock.calls)).not.toContain('SYNTHETIC_SECRET');
    expect(log).toHaveBeenCalledWith('[apm] span_batch_write_failed', { count: 1 });
});
