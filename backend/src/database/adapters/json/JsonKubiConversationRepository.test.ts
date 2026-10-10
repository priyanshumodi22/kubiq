import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { JsonKubiConversationRepository } from './JsonKubiConversationRepository';

let testDirectory = '';
const originalEnv = { ...process.env };

describe('JsonKubiConversationRepository', () => {
  beforeEach(() => {
    testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'kubiq-kubi-test-'));
    process.env = { ...originalEnv, DATA_DIR: testDirectory, AI_KUBI_HISTORY_RETENTION_DAYS: '90' };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    if (testDirectory && path.basename(testDirectory).startsWith('kubiq-kubi-test-')) fs.rmSync(testDirectory, { recursive: true, force: true });
  });

  it('keeps conversation history private to its owner and supports delete and clear', async () => {
    const repository = new JsonKubiConversationRepository();
    await repository.initialize();
    const first = await repository.createConversation('user-a', 'First investigation');
    const second = await repository.createConversation('user-a', 'Second investigation');
    await repository.createConversation('user-b', 'Private to another user');
    await repository.appendMessage('user-a', first.id, { id: 'message-1', role: 'user', content: 'Why is api slow?', createdAt: new Date().toISOString() });

    expect((await repository.getConversation('user-a', first.id))?.messages).toHaveLength(1);
    await expect(repository.getConversation('user-b', first.id)).resolves.toBeNull();
    expect(await repository.listConversations('user-a')).toHaveLength(2);
    await expect(repository.deleteConversation('user-b', second.id)).resolves.toBe(false);
    await expect(repository.deleteConversation('user-a', second.id)).resolves.toBe(true);
    await expect(repository.clearConversations('user-a')).resolves.toBe(1);
    expect(await repository.listConversations('user-a')).toEqual([]);
    expect(await repository.listConversations('user-b')).toHaveLength(1);
  });

  it('removes expired conversation records at initialization', async () => {
    const expiredFile = path.join(testDirectory, 'kubi_conversations.json');
    fs.writeFileSync(expiredFile, JSON.stringify([{
      id: 'expired', userId: 'user-a', title: 'Expired', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z',
      expiresAt: '2020-01-02T00:00:00.000Z', messages: [],
    }]));
    const repository = new JsonKubiConversationRepository();
    await repository.initialize();

    expect(await repository.listConversations('user-a')).toEqual([]);
    expect(JSON.parse(fs.readFileSync(expiredFile, 'utf8'))).toEqual([]);
  });
});
