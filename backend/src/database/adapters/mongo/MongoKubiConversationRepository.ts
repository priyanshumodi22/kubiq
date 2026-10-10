import { IKubiConversationRepository, KubiConversation, KubiConversationMessage } from '../../interfaces/IKubiConversationRepository';
import { KubiConversationModel } from '../../schemas/KubiConversationSchema';

const retentionMs = () => Math.max(1, Number(process.env.AI_KUBI_HISTORY_RETENTION_DAYS || 90)) * 24 * 60 * 60 * 1000;
const conversationId = () => `kubi-${crypto.randomUUID()}`;

export class MongoKubiConversationRepository implements IKubiConversationRepository {
  async initialize(): Promise<void> {
    await KubiConversationModel.syncIndexes();
    await this.cleanupExpired();
  }

  async createConversation(userId: string, title = 'New kubi conversation'): Promise<KubiConversation> {
    const now = new Date();
    const conversation = await KubiConversationModel.create({
      id: conversationId(), userId, title, createdAt: now.toISOString(), updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + retentionMs()), messages: [],
    });
    return this.map(conversation.toObject());
  }

  async listConversations(userId: string, limit = 50): Promise<KubiConversation[]> {
    await this.cleanupExpired();
    const rows = await KubiConversationModel.find({ userId }).sort({ updatedAt: -1 }).limit(Math.max(1, Math.min(limit, 100))).lean();
    return rows.map((row: any) => this.map(row));
  }

  async getConversation(userId: string, conversationId: string): Promise<KubiConversation | null> {
    const row = await KubiConversationModel.findOne({ id: conversationId, userId, expiresAt: { $gt: new Date() } }).lean();
    return row ? this.map(row) : null;
  }

  async appendMessage(userId: string, conversationId: string, message: KubiConversationMessage): Promise<KubiConversation | null> {
    const now = new Date();
    const row = await KubiConversationModel.findOneAndUpdate(
      { id: conversationId, userId, expiresAt: { $gt: now } },
      { $push: { messages: message }, $set: { updatedAt: now.toISOString() } }, { new: true },
    ).lean();
    return row ? this.map(row) : null;
  }

  async deleteConversation(userId: string, conversationId: string): Promise<boolean> {
    return (await KubiConversationModel.deleteOne({ id: conversationId, userId })).deletedCount === 1;
  }

  async clearConversations(userId: string): Promise<number> {
    return (await KubiConversationModel.deleteMany({ userId })).deletedCount || 0;
  }

  async cleanupExpired(): Promise<void> {
    await KubiConversationModel.deleteMany({ expiresAt: { $lte: new Date() } });
  }

  private map(row: any): KubiConversation {
    return { id: row.id, userId: row.userId, title: row.title, createdAt: row.createdAt, updatedAt: row.updatedAt,
      expiresAt: new Date(row.expiresAt).toISOString(), messages: row.messages || [] };
  }
}
