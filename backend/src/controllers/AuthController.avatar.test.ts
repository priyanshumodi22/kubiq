import { Request, Response } from 'express';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthController } from './AuthController';
const mockUpdate = jest.fn<(id: string, update: Record<string, unknown>) => Promise<Record<string, unknown>>>();
jest.mock('../database/DatabaseFactory', () => ({ DatabaseFactory: { getUserRepository: async () => ({
  findByUsername: async () => null, updateUser: (id: string, update: Record<string, unknown>) => mockUpdate(id, update),
}) } }));
jest.mock('../services/AuditLogService', () => ({ AuditLogService: { getInstance: () => ({ log: jest.fn() }) } }));
jest.mock('../middleware/auth', () => ({ getUserFromReq: () => 'fixture-user' }));
beforeEach(() => { jest.clearAllMocks(); mockUpdate.mockImplementation(async (_id, update) => ({ ...update, id: 'user' })); });
const run = async (avatarUrl: unknown, type = 'native') => {
  const result = { status: jest.fn<(code: number) => unknown>(), json: jest.fn<(body: unknown) => unknown>() };
  result.status.mockReturnValue(result); result.json.mockReturnValue(result);
  await AuthController.updateProfile({ user: { sub: 'user', type }, body: { username: 'fixture-user', avatarUrl } } as unknown as Request, result as unknown as Response);
  return result;
};
describe('avatar validation compatibility', () => {
  it.each(['png', 'jpeg', 'webp'])('retains supported %s base64 images with mixed-case alphabet', async format => {
    const avatarUrl = `data:image/${format};base64,AbCd0123+/=`;
    const result = await run(avatarUrl);
    expect(result.status).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith('user', { username: 'fixture-user', email: undefined, avatarUrl });
  });
  it('keeps unsupported, malformed and oversized images rejected', async () => {
    for (const value of ['data:image/svg+xml;base64,AbCd', 'data:image/png;base64,Ab!Cd', 'data:image/png;base64,' + 'A'.repeat(360000), {}]) {
      expect((await run(value)).status).toHaveBeenLastCalledWith(400);
    }
    expect(mockUpdate).not.toHaveBeenCalled();
  });
  it('retains identity-provider-managed profile protection', async () => {
    expect((await run('data:image/png;base64,AbCd', 'keycloak')).status).toHaveBeenLastCalledWith(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
