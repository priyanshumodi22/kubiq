import { describe, expect, it, jest } from '@jest/globals';
import { MongoAuditLogRepository } from './MongoAuditLogRepository';
import { AuditLogModel } from '../../schemas/AuditLogSchema';

jest.mock('../../schemas/AuditLogSchema', () => ({ AuditLogModel: { find: jest.fn() } }));

describe('filtered audit history', () => {
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
