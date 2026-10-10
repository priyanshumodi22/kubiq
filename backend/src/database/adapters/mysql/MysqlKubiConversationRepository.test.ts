import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import mysql from 'mysql2/promise';
import { MysqlKubiConversationRepository } from './MysqlKubiConversationRepository';

jest.mock('mysql2/promise', () => ({ __esModule: true, default: { createPool: jest.fn() } }));

const mockedMysql = mysql as any;

describe('MysqlKubiConversationRepository', () => {
  let pool: { query: jest.Mock<any>; execute: jest.Mock<any> };

  beforeEach(() => {
    process.env.AI_KUBI_HISTORY_RETENTION_DAYS = '90';
    pool = { query: jest.fn(), execute: jest.fn() };
    mockedMysql.createPool.mockReturnValue(pool);
    pool.query.mockResolvedValue([[]]);
    pool.execute.mockResolvedValue([{ affectedRows: 0 }]);
  });

  it('creates the private-history schema and stores a 90-day owner-bound record', async () => {
    const repository = new MysqlKubiConversationRepository();
    await repository.initialize();
    const before = Date.now();
    const conversation = await repository.createConversation('user-a', 'Investigation');

    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS kubi_conversations'));
    expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO kubi_conversations'), expect.arrayContaining([conversation.id, 'user-a', 'Investigation']));
    expect(new Date(conversation.expiresAt).getTime() - before).toBeGreaterThan(89 * 24 * 60 * 60 * 1000);
  });

  it('scopes reads to both the conversation owner and an unexpired record', async () => {
    const repository = new MysqlKubiConversationRepository();
    await repository.initialize();
    pool.query.mockResolvedValueOnce([[]]);

    await repository.getConversation('user-b', 'conversation-a');

    expect(pool.query).toHaveBeenLastCalledWith(expect.stringContaining('id = ? AND user_id = ? AND expires_at > UTC_TIMESTAMP(3)'), ['conversation-a', 'user-b']);
  });
});
