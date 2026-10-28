import { jest, expect, it, afterEach } from '@jest/globals';
import { normalizedTraceId, traceIdFromRecord, traceMessagePattern, normalizedSpanId, spanIdFromRecord, contextFromLogLine, uniqueLogEvents } from './logCorrelation';
import { MongoLogRepository } from '../database/adapters/mongo/MongoLogRepository';
import { LogModel } from '../database/schemas/LogSchema';
import { ClickhouseLogRepository } from '../database/adapters/clickhouse/ClickhouseLogRepository';
import { clickhouseService } from '../services/ClickhouseService';
const id = '1234567890abcdef1234567890abcdef';
const opts = { from: new Date(1000), to: new Date(2000), serviceNames: ['safe'], traceId: id, limit: 500 };
afterEach(() => { jest.restoreAllMocks(); });
it('normalizes valid structured fields and restricts message matching to complete hexadecimal IDs', () => {
    expect(normalizedTraceId(id.toUpperCase())).toBe(id);
    for (const value of [null, {}, '0000000000000000', 'invalid', '(a+)+']) expect(normalizedTraceId(value)).toBe('');
    for (const record of [{ traceId: id }, { trace_id: id }, { metadata: { traceId: id } }, { metadata: { trace_id: id } }]) expect(traceIdFromRecord(record)).toBe(id);
    for (const record of [null, 0, {}, { metadata: 'bad' }]) expect(traceIdFromRecord(record)).toBe('');
    const pattern = new RegExp(traceMessagePattern(id), 'i');
    expect(pattern.test('trace_id="'+id.toUpperCase()+'"')).toBe(true); expect(pattern.test('f'+id+'0')).toBe(false);
    expect(() => traceMessagePattern('bad')).toThrow();
});
it('Mongo parameterizes source scope and exact fields with a bounded raw-message fallback', async () => {
    const chain = { sort: jest.fn(), limit: jest.fn(), maxTimeMS: jest.fn(), lean: jest.fn(), exec: jest.fn<() => Promise<object[]>>().mockResolvedValue([{ message: id }]) };
    for (const name of ['sort','limit','maxTimeMS','lean'] as const) chain[name].mockReturnValue(chain);
    const find = jest.spyOn(LogModel, 'find').mockReturnValue(chain as unknown as ReturnType<typeof LogModel.find>);
    const repo = new MongoLogRepository(); expect(await repo.queryLogs('', { ...opts, spanId: '1234567890abcdef' })).toEqual([{ message: id }]);
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ serviceName: { $in: ['safe'] }, $or: expect.arrayContaining([{ traceId: id }, { 'metadata.trace_id': id }]) }));
    expect(chain.maxTimeMS).toHaveBeenCalledWith(5000);
    expect(find.mock.calls[0][0]).toMatchObject({ $and: [expect.objectContaining({ $or: expect.arrayContaining([{ spanId: '1234567890abcdef' }]) })] });
    const insert = jest.spyOn(LogModel, 'insertMany').mockResolvedValue([] as never);
    await repo.insertLogs([{ message: 'event', metadata: { trace_id: id } }]); expect(insert.mock.calls[0]).toEqual([[expect.objectContaining({ traceId: id })], { ordered: false }]);
});
it('ClickHouse retains structured IDs, parameterizes multi-source matching and surfaces unavailable storage', async () => {
    const query = jest.fn<(...args: unknown[]) => Promise<object>>().mockResolvedValue({ json: async () => [{ message: id }] });
    const insert = jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
    jest.spyOn(clickhouseService, 'getDatabase').mockReturnValue('default');
    const client = jest.spyOn(clickhouseService, 'getClient').mockReturnValue({ query, insert } as unknown as ReturnType<typeof clickhouseService.getClient>);
    const repo = new ClickhouseLogRepository(); expect(await repo.queryLogs('', { ...opts, spanId: '1234567890abcdef' })).toEqual([{ message: id }]);
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ query: expect.stringContaining('serviceName IN {serviceNames: Array(String)}'), query_params: expect.objectContaining({ serviceNames: ['safe'], traceId: id }), clickhouse_settings: { max_execution_time: 5 } }));
    await repo.insertLogs([{ timestamp: new Date(), metadata: { trace_id: id } }]); expect(insert).toHaveBeenCalledWith(expect.objectContaining({ values: [expect.objectContaining({ traceId: id })] }));
    jest.spyOn(console, 'error').mockImplementation(() => {}); query.mockRejectedValueOnce(new Error('offline')); await expect(repo.queryLogs('', opts)).rejects.toThrow('offline');
    client.mockReturnValue(null); await expect(repo.queryLogs('', opts)).rejects.toThrow('unavailable'); await expect(repo.getServices()).rejects.toThrow('unavailable');
});

it('preserves structured trace/span/event identity and event time from prefixed Kubernetes stdout', () => {
    const spanId = '1234567890abcdef', eventId = '12345678-1234-1234-1234-123456789012';
    const timestamp = new Date(Date.now() - 120000).toISOString();
    expect(contextFromLogLine('[apps/pod/container] '+JSON.stringify({ trace_id: id, span_id: spanId, event_id: eventId, timestamp }))).toEqual({ traceId: id, spanId, eventId, timestamp: new Date(timestamp) });
    expect(contextFromLogLine('traceId='+id+' spanId='+spanId)).toEqual({ traceId: id, spanId });
    expect(contextFromLogLine('requestId='+id)).toEqual({ traceId: '', spanId: '' });
    expect(normalizedSpanId('0000000000000000')).toBe(''); expect(normalizedSpanId({})).toBe('');
    expect(spanIdFromRecord({ metadata: { span_id: spanId } })).toBe(spanId);
    const events = [{ eventId, message: 'direct' }, { eventId, message: 'stream copy' }, { message: 'legacy' }];
    expect(uniqueLogEvents(events)).toEqual([events[0], events[2]]);
});
