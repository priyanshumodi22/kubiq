import express from 'express';
import { AddressInfo } from 'net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { apmAnalyticsRouter, apmIngestRouter } from './apm';
import { DatabaseFactory } from '../database/DatabaseFactory';

describe('APM ingestion authentication boundary', () => {
  const app = express();
  let server: ReturnType<typeof app.listen>;
  let origin = '';
  const originalToken = process.env.KUBIQ_INGESTION_TOKEN;

  beforeAll(async () => {
    process.env.KUBIQ_INGESTION_TOKEN = 'test-ingestion-token';
    app.use(express.json());
    app.use('/apm', apmIngestRouter);
    // The real server places JWT authentication here. An authenticated user is
    // sufficient to prove the ingestion guard does not intercept analytics.
    app.use('/apm', (req, _res, next) => {
      (req as any).user = { role: 'kubiq-admin', roles: ['kubiq-admin'] };
      next();
    }, apmAnalyticsRouter);
    server = app.listen(0);
    await new Promise<void>(resolve => server.once('listening', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    jest.spyOn(DatabaseFactory, 'isApmSupported').mockReturnValue(true);
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
});
