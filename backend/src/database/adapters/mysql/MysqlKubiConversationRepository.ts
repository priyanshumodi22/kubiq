import crypto from 'crypto';
import mysql, { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { IKubiConversationRepository, KubiConversation, KubiConversationMessage } from '../../interfaces/IKubiConversationRepository';

const retentionMs = () => Math.max(1, Number(process.env.AI_KUBI_HISTORY_RETENTION_DAYS || 90)) * 24 * 60 * 60 * 1000;

export class MysqlKubiConversationRepository implements IKubiConversationRepository {
  private pool!: Pool;

  async initialize(): Promise<void> {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '', database: process.env.DB_NAME || 'kubiq_db', waitForConnections: true, connectionLimit: 10, queueLimit: 0,
    });
    await this.ensureSchema();
    await this.cleanupExpired();
  }

  private async ensureSchema(): Promise<void> {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS kubi_conversations (
      id VARCHAR(80) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, title VARCHAR(255) NOT NULL,
      created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL, expires_at DATETIME(3) NOT NULL,
      messages_json JSON NOT NULL, INDEX idx_kubi_owner_updated (user_id, updated_at), INDEX idx_kubi_expiry (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  }

  async createConversation(userId: string, title = 'New kubi conversation'): Promise<KubiConversation> {
    const now = new Date();
    const conversation: KubiConversation = {
      id: `kubi-${crypto.randomUUID()}`, userId, title, createdAt: now.toISOString(), updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + retentionMs()).toISOString(), messages: [],
    };
    await this.pool.execute(
      'INSERT INTO kubi_conversations (id, user_id, title, created_at, updated_at, expires_at, messages_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [conversation.id, userId, title, now, now, new Date(conversation.expiresAt), JSON.stringify([])],
    );
    return conversation;
  }

  async listConversations(userId: string, limit = 50): Promise<KubiConversation[]> {
    await this.cleanupExpired();
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT * FROM kubi_conversations WHERE user_id = ? AND expires_at > UTC_TIMESTAMP(3) ORDER BY updated_at DESC LIMIT ${safeLimit}`,
      [userId],
    );
    return rows.map(row => this.map(row));
  }

  async getConversation(userId: string, conversationId: string): Promise<KubiConversation | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM kubi_conversations WHERE id = ? AND user_id = ? AND expires_at > UTC_TIMESTAMP(3) LIMIT 1', [conversationId, userId],
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async appendMessage(userId: string, conversationId: string, message: KubiConversationMessage): Promise<KubiConversation | null> {
    const existing = await this.getConversation(userId, conversationId);
    if (!existing) return null;
    const messages = [...existing.messages, message];
    const now = new Date();
    await this.pool.execute('UPDATE kubi_conversations SET messages_json = ?, updated_at = ? WHERE id = ? AND user_id = ?',
      [JSON.stringify(messages), now, conversationId, userId]);
    return { ...existing, messages, updatedAt: now.toISOString() };
  }

  async deleteConversation(userId: string, conversationId: string): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>('DELETE FROM kubi_conversations WHERE id = ? AND user_id = ?', [conversationId, userId]);
    return result.affectedRows === 1;
  }

  async clearConversations(userId: string): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>('DELETE FROM kubi_conversations WHERE user_id = ?', [userId]);
    return result.affectedRows;
  }

  async cleanupExpired(): Promise<void> {
    await this.pool.execute('DELETE FROM kubi_conversations WHERE expires_at <= UTC_TIMESTAMP(3)');
  }

  private map(row: any): KubiConversation {
    return {
      id: row.id, userId: row.user_id, title: row.title, createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(), expiresAt: new Date(row.expires_at).toISOString(),
      messages: typeof row.messages_json === 'string' ? JSON.parse(row.messages_json) : row.messages_json || [],
    };
  }
}
