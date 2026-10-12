import express from 'express';
import { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { systemRouter } from './system';
import { rbacRouter } from './rbac';

/**
 * These are HTTP-level checks, not component visibility checks. A viewer can
 * still craft the hidden management URLs, so every one must be rejected before
 * a service, system, RBAC, or Kubernetes action handler is reached.
 */
describe('RBAC direct API denial', () => {
  const app = express();
  let server: ReturnType<typeof app.listen>;
  let origin = '';

  beforeAll(async () => {
    app.use(express.json());
    app.use((_req, _res, next) => {
      (_req as any).user = { id: 'viewer-1', username: 'viewer', role: 'kubiq-viewer', roles: ['kubiq-viewer'], allowedNamespaces: ['apps'] };
      next();
    });
    app.use('/system', systemRouter);
    app.use('/rbac', rbacRouter);
    server = app.listen(0);
    await new Promise<void>(resolve => server.once('listening', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  const expectForbidden = async (path: string, method = 'POST', body?: unknown) => {
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: 'RBAC_FORBIDDEN' }));
  };

  it('rejects hidden management and sensitive routes for a kubiq-viewer', async () => {
    await expectForbidden('/system/disks/config', 'PUT', { mounts: ['/'] });
    await expectForbidden('/system/kubi-ai', 'PUT', { provider: 'gemini', model: 'anything' });
    await expectForbidden('/rbac/roles', 'GET');
    await expectForbidden('/rbac/roles', 'POST', { name: 'crafted-role', description: '', permissions: ['audit.read'] });
  });
});
