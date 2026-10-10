import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { IKubiConversationRepository, KubiConversation, KubiConversationMessage } from '../../interfaces/IKubiConversationRepository';

const retentionMs = () => Math.max(1, Number(process.env.AI_KUBI_HISTORY_RETENTION_DAYS || 90)) * 24 * 60 * 60 * 1000;

export class JsonKubiConversationRepository implements IKubiConversationRepository {
  private filePath: string;
  private conversations: KubiConversation[] = [];

  constructor() {
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    this.filePath = path.join(dataDir, 'kubi_conversations.json');
  }

  async initialize(): Promise<void> {
    try {
      this.conversations = fs.existsSync(this.filePath) ? JSON.parse(fs.readFileSync(this.filePath, 'utf8')) : [];
    } catch {
      this.conversations = [];
    }
    await this.cleanupExpired();
  }

  async createConversation(userId: string, title = 'New kubi conversation'): Promise<KubiConversation> {
    const now = new Date();
    const conversation: KubiConversation = { id: `kubi-${crypto.randomUUID()}`, userId, title, createdAt: now.toISOString(), updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + retentionMs()).toISOString(), messages: [] };
    this.conversations.unshift(conversation);
    this.persist();
    return conversation;
  }

  async listConversations(userId: string, limit = 50): Promise<KubiConversation[]> {
    await this.cleanupExpired();
    return this.conversations.filter(item => item.userId === userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, Math.max(1, Math.min(limit, 100)));
  }

  async getConversation(userId: string, conversationId: string): Promise<KubiConversation | null> {
    await this.cleanupExpired();
    return this.conversations.find(item => item.id === conversationId && item.userId === userId) || null;
  }

  async appendMessage(userId: string, conversationId: string, message: KubiConversationMessage): Promise<KubiConversation | null> {
    const conversation = await this.getConversation(userId, conversationId);
    if (!conversation) return null;
    conversation.messages.push(message);
    conversation.updatedAt = new Date().toISOString();
    this.persist();
    return conversation;
  }

  async deleteConversation(userId: string, conversationId: string): Promise<boolean> {
    const before = this.conversations.length;
    this.conversations = this.conversations.filter(item => !(item.id === conversationId && item.userId === userId));
    if (before !== this.conversations.length) this.persist();
    return before !== this.conversations.length;
  }

  async clearConversations(userId: string): Promise<number> {
    const before = this.conversations.length;
    this.conversations = this.conversations.filter(item => item.userId !== userId);
    const deleted = before - this.conversations.length;
    if (deleted) this.persist();
    return deleted;
  }

  async cleanupExpired(): Promise<void> {
    const now = Date.now();
    const before = this.conversations.length;
    this.conversations = this.conversations.filter(item => new Date(item.expiresAt).getTime() > now);
    if (before !== this.conversations.length) this.persist();
  }

  private persist(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.conversations, null, 2), 'utf8');
  }
}
