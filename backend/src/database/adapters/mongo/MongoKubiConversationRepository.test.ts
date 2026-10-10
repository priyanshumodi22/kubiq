import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MongoKubiConversationRepository } from './MongoKubiConversationRepository';
import { KubiConversationModel } from '../../schemas/KubiConversationSchema';

jest.mock('../../schemas/KubiConversationSchema', () => ({
  KubiConversationModel: {
    syncIndexes: jest.fn(), deleteMany: jest.fn(), create: jest.fn(), find: jest.fn(), findOne: jest.fn(),
    findOneAndUpdate: jest.fn(), deleteOne: jest.fn(),
  },
}));

const model = KubiConversationModel as any;

describe('MongoKubiConversationRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AI_KUBI_HISTORY_RETENTION_DAYS = '90';
    model.deleteMany.mockResolvedValue({ deletedCount: 0 });
  });

  it('creates a 90-day owner-bound conversation and always scopes reads by owner', async () => {
    const repository = new MongoKubiConversationRepository();
    const createdAt = new Date();
    model.create.mockImplementation(async (value: any) => ({ toObject: () => value }));
    model.findOne.mockReturnValue({ lean: (() => Promise.resolve(null)) as any });

    const conversation = await repository.createConversation('user-a', 'My investigation');
    await repository.getConversation('user-b', conversation.id);

    expect(conversation.userId).toBe('user-a');
    expect(new Date(conversation.expiresAt).getTime() - createdAt.getTime()).toBeGreaterThan(89 * 24 * 60 * 60 * 1000);
    expect(model.findOne).toHaveBeenCalledWith(expect.objectContaining({ id: conversation.id, userId: 'user-b' }));
  });

  it('uses an owner and non-expired filter when appending a message', async () => {
    const repository = new MongoKubiConversationRepository();
    model.findOneAndUpdate.mockReturnValue({ lean: (() => Promise.resolve(null)) as any });

    await repository.appendMessage('user-a', 'conversation-a', { id: 'message-a', role: 'user', content: 'status?', createdAt: new Date().toISOString() });

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'conversation-a', userId: 'user-a', expiresAt: expect.any(Object) }),
      expect.objectContaining({ $push: expect.any(Object), $set: expect.any(Object) }),
      { new: true },
    );
  });
});
