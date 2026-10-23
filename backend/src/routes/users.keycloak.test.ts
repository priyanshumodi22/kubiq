import express, { Request, Response, NextFunction } from 'express';
import { AddressInfo } from 'node:net';
import { beforeAll, afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { usersRouter } from './users';

const mockListUsers = jest.fn<(search?: string) => Promise<Array<{ id: string; username: string; roles: string[]; enabled: boolean }>>>();
const mockUpdateUser = jest.fn<(id: string, update: { enabled: boolean }) => Promise<void>>();
jest.mock('../middleware/auth', () => ({
  getAuthenticationProvider: () => 'keycloak', getUserFromReq: () => 'actor',
  authMiddleware: (req: Request, _res: Response, next: NextFunction) => { Object.assign(req, { user: { sub: 'actor' } }); next(); },
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
jest.mock('../database/DatabaseFactory', () => ({ DatabaseFactory: { getUserRepository: async () => ({}) } }));
jest.mock('../services/AuditLogService', () => ({ AuditLogService: { getInstance: () => ({ log: jest.fn() }) } }));
jest.mock('../services/RbacRoleService', () => ({ RbacRoleService: {} }));
jest.mock('../services/KeycloakAdminService', () => ({ KeycloakAdminService: class {
  listUsers(search?: string) { return mockListUsers(search); }
  updateUser(id: string, update: { enabled: boolean }) { return mockUpdateUser(id, update); }
} }));

describe('Keycloak user route compatibility', () => {
  const app = express();
  let server: ReturnType<typeof app.listen>;
  let origin: string;
  const users = [
    { id: 'target', username: 'target', roles: ['kubiq-admin'], enabled: true },
    { id: 'other', username: 'other', roles: ['kubiq-admin'], enabled: true },
  ];
  beforeAll(async () => {
    app.use(express.json()); app.use('/users', usersRouter);
    server = app.listen(0);
    await new Promise<void>(resolve => server.once('listening', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
  beforeEach(() => {
    jest.clearAllMocks(); mockListUsers.mockResolvedValue(users); mockUpdateUser.mockResolvedValue(undefined);
  });
  const update = (id: string, enabled: unknown) => fetch(`${origin}/users/${id}/status`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled }) });

  it('passes a valid string search and preserves omitted search', async () => {
    expect((await fetch(`${origin}/users?search=alice`)).status).toBe(200);
    expect(mockListUsers).toHaveBeenLastCalledWith('alice');
    expect((await fetch(`${origin}/users`)).status).toBe(200);
    expect(mockListUsers).toHaveBeenLastCalledWith(undefined);
  });
  it('rejects repeated search values instead of coercing them to a different search', async () => {
    expect((await fetch(`${origin}/users?search=alice&search=bob`)).status).toBe(400);
    expect(mockListUsers).not.toHaveBeenCalled();
  });
  it('allows disabling a target while another active admin remains', async () => {
    const result = await update('target', false);
    expect(result.status).toBe(200);
    expect(mockUpdateUser).toHaveBeenCalledWith('target', { enabled: false });
    await expect(result.json()).resolves.toMatchObject({ id: 'target', enabled: false });
  });
  it('protects the last active admin', async () => {
    mockListUsers.mockResolvedValue([users[0]]);
    expect((await update('target', false)).status).toBe(409);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
  it('returns 404 for a missing target', async () => {
    expect((await update('missing', true)).status).toBe(404);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
  it('preserves failure handling when the provider rejects', async () => {
    mockListUsers.mockRejectedValue(new Error('Provider unavailable'));
    const result = await update('target', false);
    expect(result.status).toBe(500);
    await expect(result.json()).resolves.toEqual({ message: 'Provider unavailable' });
  });
  it('rejects invalid status payloads before reaching the provider', async () => {
    expect((await update('target', 'false')).status).toBe(400);
    expect(mockListUsers).not.toHaveBeenCalled();
  });
  it('does not allow the requester to disable their own account', async () => {
    expect((await update('actor', false)).status).toBe(400);
    expect(mockListUsers).not.toHaveBeenCalled();
  });
});
