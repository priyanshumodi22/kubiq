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
