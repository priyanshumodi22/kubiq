import express from 'express';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { authMiddleware, getSocketUser, requirePermission } from './auth';
import { getNativeJwtSecret } from '../utils/nativeJwt';
import type { User } from '../types';

const findUser = jest.fn<(id: string) => Promise<User | null>>();
jest.mock('../database/DatabaseFactory', () => ({ DatabaseFactory: { getUserRepository: async () => ({ findById: findUser }) } }));

describe('Native authorization uses current account state', () => {
  const app = express();
  let server: ReturnType<typeof app.listen>;
  let origin: string;
  let token: string;
  beforeAll(async () => {
    token = jwt.sign({ sub: 'fixture-user', username: 'old-name', roles: ['kubiq-admin'], allowedNamespaces: ['*'], type: 'native' }, getNativeJwtSecret(), { expiresIn: '5m' });
    app.use(authMiddleware);
    app.get('/manage', requirePermission('users.manage'), (_req, res) => res.json({ ok: true }));
    app.get('/me', (req, res) => res.json(req.user));
    server = app.listen(0);
    await new Promise<void>(resolve => server.once('listening', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  beforeEach(() => { findUser.mockReset().mockResolvedValue({ id: 'fixture-user', username: 'renamed-user', role: 'kubiq-viewer', roles: ['kubiq-viewer'], allowedNamespaces: ['apps'], enabled: true }); });
  afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
  const request = (path: string) => fetch(origin + path, { headers: { authorization: `Bearer ${token}` } });

  test('a still-valid former admin token cannot retain a revoked role', async () => {
    expect((await request('/manage')).status).toBe(403);
  });
  test('current identity and namespace scope replace stale token claims', async () => {
    const response = await request('/me');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ username: 'renamed-user', preferred_username: 'renamed-user', roles: ['kubiq-viewer'], allowedNamespaces: ['apps'] }));
  });
  test.each([null, { id: 'fixture-user', username: 'disabled', role: 'kubiq-admin', enabled: false }])('rejects a deleted or disabled account', async account => {
    findUser.mockResolvedValue(account);
    expect((await request('/manage')).status).toBe(401);
    await expect(getSocketUser(token)).resolves.toBeNull();
  });
  test('Socket.IO handshakes receive the same current roles and scopes', async () => {
    await expect(getSocketUser(token)).resolves.toEqual(expect.objectContaining({ username: 'renamed-user', roles: ['kubiq-viewer'], allowedNamespaces: ['apps'] }));
  });
  test('repository failure denies authentication instead of trusting cached privilege claims', async () => {
    findUser.mockRejectedValue(new Error('database offline'));
    expect((await request('/manage')).status).toBe(503);
    await expect(getSocketUser(token)).resolves.toBeNull();
  });
  test('supports authenticated SSE query tokens but rejects duplicate query credentials', async () => {
    expect((await fetch(`${origin}/me?token=${encodeURIComponent(token)}`)).status).toBe(200);
    findUser.mockClear();
    expect((await fetch(`${origin}/me?token=one&token=two`)).status).toBe(401);
    expect(findUser).not.toHaveBeenCalled();
  });
  test('rejects expired and wrong-provider tokens before reading account data', async () => {
    const expired = jwt.sign({ sub: 'fixture-user', type: 'native' }, getNativeJwtSecret(), { expiresIn: -1 });
    const wrongProvider = jwt.sign({ sub: 'fixture-user', type: 'keycloak' }, getNativeJwtSecret(), { expiresIn: '5m' });
    for (const credential of [expired, wrongProvider]) {
      expect((await fetch(origin + '/me', { headers: { authorization: `Bearer ${credential}` } })).status).toBe(401);
      await expect(getSocketUser(credential)).resolves.toBeNull();
    }
    expect(findUser).not.toHaveBeenCalled();
  });
});
