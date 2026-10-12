import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { describe, expect, it, jest } from '@jest/globals';

const findByUsername = jest.fn<any>();
const updateLastLogin = jest.fn<any>();
jest.mock('../database/DatabaseFactory', () => ({
  DatabaseFactory: { getUserRepository: jest.fn(async () => ({ findByUsername, updateLastLogin })) },
}));
jest.mock('../services/AuditLogService', () => ({
  AuditLogService: { getInstance: () => ({ log: jest.fn() }) },
}));

import { AuthController } from './AuthController';

const response = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('Native authentication login flow', () => {
  it('issues a Native JWT carrying the persisted roles and namespace scope', async () => {
    findByUsername.mockResolvedValue({
      id: 'native-user-1', username: 'operator', passwordHash: await bcrypt.hash('CorrectHorseBatteryStaple!', 4), enabled: true,
      role: 'kubiq-user', roles: ['kubiq-user', 'incident-reader'], allowedNamespaces: ['payments'],
    });
    const res = response();
    // Route registration passes a static handler unbound, matching Express.
    const loginHandler = AuthController.login;
    await loginHandler({ body: { username: 'operator', password: 'CorrectHorseBatteryStaple!' }, ip: '127.0.0.1' } as any, res);
    const body = res.json.mock.calls[0][0];
    expect(body.user.passwordHash).toBeUndefined();
    expect(jwt.verify(body.token, 'dev-secret-do-not-use-in-prod')).toMatchObject({ type: 'native', roles: ['kubiq-user', 'incident-reader'], allowedNamespaces: ['payments'] });
    expect(updateLastLogin).toHaveBeenCalledWith('native-user-1');
  });

  it('rejects disabled users before checking their password', async () => {
    findByUsername.mockResolvedValue({ id: 'native-user-2', username: 'disabled', passwordHash: 'ignored', enabled: false });
    const res = response();
    await AuthController.login({ body: { username: 'disabled', password: 'CorrectHorseBatteryStaple!' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
