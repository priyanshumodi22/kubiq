import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, test, jest } from '@jest/globals';
import { servicesRouter } from './services';

const service = { name: 'api', endpoint: 'https://example.test', type: 'http', currentStatus: 'healthy', history: [], logPath: '/private/app.log', logSources: [{ path: '/private/other.log' }] };
jest.mock('../services/ServiceMonitor', () => ({ ServiceMonitor: { getInstance: () => ({ getAllServices: () => [service], getServiceByName: () => service, getStats: () => ({}) }) } }));
jest.mock('../services/AuditLogService', () => ({ AuditLogService: { getInstance: () => ({ log: jest.fn() }) } }));
jest.mock('../services/RbacRoleService', () => ({ RbacRoleService: { hasPermission: async (user: { raw?: boolean }, permission: string) => permission !== 'logs.raw.read' || user.raw === true } }));

describe('service raw-log permission boundary over HTTP', () => {
  const app = express();
  let server: ReturnType<typeof app.listen>;
  let origin: string;
  beforeAll(async () => {
    app.use((req, _res, next) => { req.user = { raw: req.headers['x-test-raw'] === 'yes' }; next(); });
    app.use('/services', servicesRouter);
    server = app.listen(0);
    await new Promise<void>(resolve => server.once('listening', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

  test.each(['/status', '/api'])('%s omits raw paths for readers without the permission', async path => {
    const response = await fetch(`${origin}/services${path}`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain('/private/');
    expect(service.logPath).toBe('/private/app.log');
  });
  test('authorized status consumers still receive their configured sources', async () => {
    const response = await fetch(`${origin}/services/status`, { headers: { 'x-test-raw': 'yes' } });
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ services: [expect.objectContaining({ logPath: '/private/app.log', logSources: [{ path: '/private/other.log' }] })] }));
  });
});
