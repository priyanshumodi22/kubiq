import express from 'express';
import { AddressInfo } from 'net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { apmAnalyticsRouter, apmIngestRouter } from './apm';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { IngestionBufferService } from '../services/IngestionBufferService';

const acceptedSpans = jest.fn<IngestionBufferService['addSpans']>().mockReturnValue(true);
jest.mock('../services/IngestionBufferService', () => ({ IngestionBufferService: { getInstance: () => ({ addSpans: acceptedSpans }) } }));
const otlpSpan = (overrides = {}) => ({ traceId: '0123456789abcdef0123456789abcdef', spanId: '0123456789abcdef', name: 'GET /orders', kind: 2, startTimeUnixNano: '1000000000', endTimeUnixNano: '1005000000', attributes: [{ key: 'http.target', value: { stringValue: '/orders' } }], ...overrides });
const payload = (spans = [otlpSpan()]) => ({ resourceSpans: [{ resource: { attributes: [{ key: 'service.name', value: { stringValue: 'fixture-api' } }] }, scopeSpans: [{ spans }] }] });

describe('APM ingestion authentication boundary', () => {
  const app = express();
  let server: ReturnType<typeof app.listen>;
  let origin = '';
  const originalToken = process.env.KUBIQ_INGESTION_TOKEN;

  beforeAll(async () => {
    process.env.KUBIQ_INGESTION_TOKEN = 'test-ingestion-token';
    app.use(express.json({ limit: '2mb' }));
    app.use('/apm', apmIngestRouter);
    // The real server places JWT authentication here. An authenticated user is
    // sufficient to prove the ingestion guard does not intercept analytics.
    app.use('/apm', (req, _res, next) => {
      req.user = { role: 'kubiq-admin', roles: ['kubiq-admin'] };
      next();
    }, apmAnalyticsRouter);
    server = app.listen(0);
    await new Promise<void>(resolve => server.once('listening', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    acceptedSpans.mockClear().mockReturnValue(true);
    jest.spyOn(DatabaseFactory, 'isApmSupported').mockReturnValue(true);
    jest.spyOn(DatabaseFactory, 'getSystemRepository').mockResolvedValue({ getApmConfig: async () => ({ ignoredRoutes: ['/healthz'] }) } as Awaited<ReturnType<typeof DatabaseFactory.getSystemRepository>>);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (originalToken === undefined) delete process.env.KUBIQ_INGESTION_TOKEN;
    else process.env.KUBIQ_INGESTION_TOKEN = originalToken;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  it('keeps authenticated analytics reachable without an ingestion token', async () => {
    const response = await fetch(`${origin}/apm/status`);
    expect(response.status).toBe(200);
  });

  it('rejects an unauthenticated OTLP write before it reaches ingestion', async () => {
    const response = await fetch(`${origin}/apm/v1/traces`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(401);
  });

  it('accepts a correctly authenticated OTLP write', async () => {
    const response = await fetch(`${origin}/apm/v1/traces`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-ingestion-token' },
      body: '{}',
    });
    expect(response.status).toBe(202);
  });

  const ingest = (body: unknown) => fetch(`${origin}/apm/v1/traces`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer test-ingestion-token' }, body: JSON.stringify(body),
  });

  it('normalizes a real OTLP JSON span and passes it to the buffer', async () => {
    expect((await ingest(payload())).status).toBe(202);
    expect(acceptedSpans).toHaveBeenCalledWith([expect.objectContaining({ traceId: otlpSpan().traceId, spanId: otlpSpan().spanId, serviceName: 'fixture-api', name: 'GET /orders', kind: 2, durationMs: 5, parentSpanId: null, attributes: { 'http.target': '/orders' } })]);
  });

  it('drops every span belonging to an ignored trace', async () => {
    const ignored = otlpSpan({ name: 'GET /healthz' });
    expect((await ingest(payload([ignored, otlpSpan({ parentSpanId: ignored.spanId, name: 'child' })]))).status).toBe(202);
    expect(acceptedSpans).not.toHaveBeenCalled();
  });

  it('reports backpressure without claiming a successful ingestion', async () => {
    acceptedSpans.mockReturnValue(false);
    expect((await ingest(payload())).status).toBe(429);
  });

  it('rejects an oversized batch without enqueueing a partial batch', async () => {
    const response = await ingest(payload(Array.from({ length: 1001 }, () => otlpSpan())));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual(expect.objectContaining({ error: 'APM_BATCH_TOO_LARGE' }));
    expect(acceptedSpans).not.toHaveBeenCalled();
  });

  it('does not interpret a numeric http.target attribute as executable string logic', async () => {
    expect((await ingest(payload([otlpSpan({ attributes: [{ key: 'http.target', value: { intValue: 42 } }] })]))).status).toBe(202);
  });

  it('rejects protobuf explicitly instead of accepting and silently discarding it', async () => {
    const response = await fetch(`${origin}/apm/v1/traces`, {
      method: 'POST', headers: { 'content-type': 'application/x-protobuf', authorization: 'Bearer test-ingestion-token' }, body: 'protobuf-fixture',
    });
    expect(response.status).toBe(415);
    expect(acceptedSpans).not.toHaveBeenCalled();
  });

  it.each([
    { resourceSpans: 'not-an-array' },
    { resourceSpans: [null] },
    { resourceSpans: [{ scopeSpans: [{}], resource: { attributes: {} } }] },
    payload([otlpSpan({ startTimeUnixNano: 'invalid' })]),
    payload([otlpSpan({ endTimeUnixNano: '1' })]),
    payload([otlpSpan({ traceId: null })]),
    payload([otlpSpan({ attributes: [null] })]),
  ])('rejects malformed payload %# without enqueueing', async body => {
    const response = await ingest(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(expect.objectContaining({ error: 'APM_INVALID_PAYLOAD' }));
    expect(acceptedSpans).not.toHaveBeenCalled();
  });
});
