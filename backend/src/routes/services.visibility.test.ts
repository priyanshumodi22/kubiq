import express from 'express';
import compression from 'compression';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, test, jest } from '@jest/globals';
import { servicesRouter } from './services';

const service = { name: 'api', endpoint: 'mongodb://reader:FIXTURE_DB_PASSWORD@db.internal/app', type: 'mongodb', currentStatus: 'healthy', history: [], logPath: '/private/app.log', logSources: [{ path: '/private/other.log' }] };
let persistedEndpoint = '';
jest.mock('../services/ServiceMonitor', () => ({ ServiceMonitor: { getInstance: () => ({
  getAllServices: () => [service], getServiceByName: () => service, getStats: () => ({}),
  addService: async (config: object) => ({ ...service, ...config }),
  updateService: async (_name: string, config: { endpoint: string }) => { persistedEndpoint = config.endpoint; return { ...service, ...config }; },
}) } }));
jest.mock('../services/AuditLogService', () => ({ AuditLogService: { getInstance: () => ({ log: jest.fn() }) } }));
jest.mock('../services/RbacRoleService', () => ({ RbacRoleService: { hasPermission: async (user: { raw?: boolean }, permission: string) => permission !== 'logs.raw.read' || user.raw === true } }));

describe('service raw-log permission boundary over HTTP', () => {
  const app = express();
  let server: ReturnType<typeof app.listen>;
  let origin: string;
  beforeAll(async () => {
    app.use(compression({ threshold: 0 }));
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { raw: req.headers['x-test-raw'] === 'yes' }; next(); });
    app.use('/services', servicesRouter);
    server = app.listen(0);
    await new Promise<void>(resolve => server.once('listening', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

  test.each(['', '/status', '/api'])('%s omits raw paths for readers without the permission', async path => {
    const response = await fetch(`${origin}/services${path}`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain('/private/');
    expect(JSON.stringify(body)).not.toContain('FIXTURE_DB_PASSWORD');
    expect(service.logPath).toBe('/private/app.log');
  });
  test('authorized status consumers still receive their configured sources', async () => {
    const response = await fetch(`${origin}/services/status`, { headers: { 'x-test-raw': 'yes' } });
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ services: [expect.objectContaining({ logPath: '/private/app.log', logSources: [{ path: '/private/other.log' }] })] }));
  });
  test('SSE delivers its first event without gzip/proxy buffering and keeps raw-log fields private', async () => {
    const abort = new AbortController();
    const deadline = setTimeout(() => abort.abort(), 2000);
    try {
      const response = await fetch(`${origin}/services/stream`, { signal: abort.signal, headers: { 'Accept-Encoding': 'gzip' } });
      expect(response.headers.get('cache-control')).toContain('no-transform');
      expect(response.headers.get('x-accel-buffering')).toBe('no');
      expect(response.headers.get('content-encoding')).toBeNull();
      const reader = response.body!.getReader();
      const first = new TextDecoder().decode((await reader.read()).value);
      expect(first).toContain('data: ');
      expect(first).not.toContain('/private/');
      expect(first).not.toContain('FIXTURE_DB_PASSWORD');
      await reader.cancel();
    } finally { clearTimeout(deadline); abort.abort(); }
  });
  test('saving other settings preserves the real password, while save responses redact it', async () => {
    const response = await fetch(`${origin}/services/api`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'mongodb://reader:*****@db.internal/app', interval: 60000 }) });
    expect(response.status).toBe(200);
    expect(persistedEndpoint).toBe(service.endpoint);
    expect(JSON.stringify(await response.json())).not.toContain('FIXTURE_DB_PASSWORD');
  });
  test('changing a masked connection fails before credentials can be overwritten', async () => {
    persistedEndpoint = '';
    const response = await fetch(`${origin}/services/api`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'mongodb://reader:*****@new-db/app' }) });
    expect(response.status).toBe(400);
    expect(persistedEndpoint).toBe('');
  });
  test('new connections do not echo their password', async () => {
    const response = await fetch(`${origin}/services`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'api', type: 'mongodb', endpoint: service.endpoint }) });
    expect(response.status).toBe(201);
    expect(JSON.stringify(await response.json())).not.toContain('FIXTURE_DB_PASSWORD');
  });
});
