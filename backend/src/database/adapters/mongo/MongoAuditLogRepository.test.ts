import { describe, expect, it, jest } from '@jest/globals';
import { MongoAuditLogRepository } from './MongoAuditLogRepository';
import { AuditLogModel } from '../../schemas/AuditLogSchema';

jest.mock('../../schemas/AuditLogSchema', () => ({ AuditLogModel: { find: jest.fn() } }));

describe('filtered audit history', () => {
  it('treats regex metacharacters in audit search as literal text', async () => {
    const lean = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]);
    const limit = jest.fn().mockReturnValue({ lean });
    const sort = jest.fn().mockReturnValue({ limit });
    jest.mocked(AuditLogModel.find).mockReturnValue({ sort } as never);
    const search = String.raw`user.[admin]+(test)\account$`;
    await new MongoAuditLogRepository().getAuditLogs(25, search);
    const calls = jest.mocked(AuditLogModel.find).mock.calls;
    const query = calls[calls.length - 1][0] as unknown as { $or: Array<{ user: RegExp }> };
    const pattern = query.$or[0].user;
    expect(pattern.test(search)).toBe(true);
    expect(pattern.test('userXadminntestaccount')).toBe(false);
  });

  it('filters action and affected account before limiting results', async () => {
    const lean = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]);
    const limit = jest.fn().mockReturnValue({ lean });
    const sort = jest.fn().mockReturnValue({ limit });
    jest.mocked(AuditLogModel.find).mockReturnValue({ sort } as never);
    await new MongoAuditLogRepository().getAuditLogs(51, undefined, { action: 'AUTH_ROLE_CHANGE', target: 'user/read' });
    expect(AuditLogModel.find).toHaveBeenCalledWith({ action: 'AUTH_ROLE_CHANGE', target: 'user/read' });
    expect(sort).toHaveBeenCalledWith({ timestamp: -1 });
    expect(limit).toHaveBeenCalledWith(51);
  });
});
