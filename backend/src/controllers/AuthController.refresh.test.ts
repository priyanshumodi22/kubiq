import jwt from 'jsonwebtoken';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { RbacRoleService } from '../services/RbacRoleService';

const findById = jest.fn<any>();
jest.mock('../database/DatabaseFactory', () => ({ DatabaseFactory: { getUserRepository: jest.fn(async () => ({ findById })) } }));
import { AuthController } from './AuthController';

const response = () => { const res: any = {}; res.status = jest.fn(() => res); res.json = jest.fn(() => res); return res; };
const token = (sub: string) => jwt.sign({ sub, type: 'native' }, 'dev-secret-do-not-use-in-prod', { expiresIn: '5m' });
afterEach(() => { jest.restoreAllMocks(); });

describe('Native session refresh', () => {
  it('returns the same persisted scope when Express invokes the me handler unbound', async () => {
    jest.spyOn(RbacRoleService, 'getEffectivePermissions').mockResolvedValue(['services.read']);
    findById.mockResolvedValue({ id: 'u-1', username: 'reader', role: 'kubiq-viewer', roles: ['incident-reader'], allowedNamespaces: ['payments'], enabled: true });
    const res = response();
    const handler = AuthController.me;
    await handler({ user: { sub: 'u-1', type: 'native' } } as any, res);
    const body = res.json.mock.calls[0][0];
    expect(jwt.verify(body.token, 'dev-secret-do-not-use-in-prod')).toMatchObject({ sub: 'u-1', roles: ['incident-reader'], allowedNamespaces: ['payments'], type: 'native' });
    expect(body.permissions).toEqual(['services.read']);
  });

  it('rejects me requests for disabled Native accounts without issuing a token', async () => {
    findById.mockResolvedValue({ id: 'u-1', enabled: false });
    const res = response();
    await AuthController.me({ user: { sub: 'u-1', type: 'native' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Account is disabled' });
  });

  it('reissues a token using current persisted roles and namespaces', async () => {
    jest.spyOn(RbacRoleService, 'getEffectivePermissions').mockResolvedValue(['services.read']);
    findById.mockResolvedValue({ id: 'u-1', username: 'reader', role: 'kubiq-viewer', roles: ['kubiq-viewer'], allowedNamespaces: ['apps'], enabled: true });
    const res = response();
    const refreshHandler = AuthController.refresh;
    await refreshHandler({ headers: { authorization: `Bearer ${token('u-1')}` } } as any, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ token: expect.any(String) }));
    const issued = res.json.mock.calls[0][0].token;
    expect(jwt.verify(issued, 'dev-secret-do-not-use-in-prod')).toMatchObject({ roles: ['kubiq-viewer'], allowedNamespaces: ['apps'] });
    expect(res.json.mock.calls[0][0].user.permissions).toEqual(['services.read']);
  });

  it('rejects refresh for a disabled account', async () => {
    findById.mockResolvedValue({ id: 'u-1', enabled: false }); const res = response();
    await AuthController.refresh({ headers: { authorization: `Bearer ${token('u-1')}` } } as any, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
