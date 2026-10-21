import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { ClickhouseTraceRepository } from './ClickhouseTraceRepository';
import { clickhouseService } from '../../../services/ClickhouseService';

afterEach(() => { jest.restoreAllMocks(); });
const fixture = (rows: unknown[]) => {
  const query = jest.fn<(args: { query: string; query_params: Record<string, string | number> }) => Promise<{ json: () => Promise<unknown[]> }>>()
    .mockResolvedValue({ json: async () => rows });
  jest.spyOn(clickhouseService, 'getClient').mockReturnValue({ query } as unknown as ReturnType<typeof clickhouseService.getClient>);
  jest.spyOn(clickhouseService, 'getDatabase').mockReturnValue('default');
  return { repository: new ClickhouseTraceRepository(), query };
};

describe('ClickHouse trace adapter fixtures', () => {
  test('binds dependency window and normalizes numeric counts', async () => {
    const { repository, query } = fixture([{ source: 'api', target: 'db', callCount: '7', errorCount: '2' }]);
    expect(await repository.getServiceDependencies(0, 1000)).toEqual([{ source: 'api', target: 'db', callCount: 7, errorCount: 2 }]);
    const request = query.mock.calls[0][0];
    expect(request.query).toContain('c.traceId = p.traceId');
    expect(request.query_params).toEqual({ from: '1970-01-01 00:00:00', to: '1970-01-01 00:00:01' });
  });
  test('binds edge service names rather than interpolating caller input', async () => {
    const { repository, query } = fixture([{ traceId: 'trace-1' }]);
    const source = "api' OR 1=1 --";
    expect(await repository.getRecentTraceIdForEdge(source, 'db')).toBe('trace-1');
    const request = query.mock.calls[0][0];
    expect(request.query).not.toContain(source);
    expect(request.query_params).toEqual(expect.objectContaining({ sourceName: source, targetName: 'db' }));
    expect(request.query).toContain('LIMIT 1');
  });
  test('exports bounded, filtered spans with parsed attributes', async () => {
    const { repository, query } = fixture([{ traceId: 'trace', spanId: 'span', attributes: '{"http.status_code":500}' }]);
    const rows = await repository.getSpansForExport({ serviceName: 'api', fromTime: new Date(0), toTime: new Date(1000), minDurationMs: 20, errorOnly: true, spanNameSearch: "route'" });
    expect(rows[0].attributes).toEqual({ 'http.status_code': 500 });
    const request = query.mock.calls[0][0];
    expect(request.query).toContain('LIMIT 2000');
    expect(request.query).toContain('statusCode = 2');
    expect(request.query).not.toContain("route'");
    expect(request.query_params).toEqual({ serviceName: 'api', from: '1970-01-01 00:00:00', to: '1970-01-01 00:00:01', minDuration: 20, search: "%route'%" });
  });
  test('missing connection and query failure return unavailable/empty results without throwing', async () => {
    const { repository, query } = fixture([]);
    expect(await repository.getRecentTraceIdForEdge('api', 'db')).toBeNull();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    query.mockRejectedValue(new Error('offline'));
    expect(await repository.getServiceDependencies(0, 1000)).toEqual([]);
    jest.spyOn(clickhouseService, 'getClient').mockReturnValue(null);
    expect(await repository.getSpansForExport({})).toEqual([]);
  });
});
