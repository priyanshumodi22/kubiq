import mysql, { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { INotificationRepository } from '../../interfaces/INotificationRepository';
import { NotificationChannel } from '../../../types';

export class MysqlNotificationRepository implements INotificationRepository {
  private pool!: Pool;
  private channels: Map<string, NotificationChannel> = new Map();

  async initialize(): Promise<void> {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
      database: process.env.DB_NAME || 'kubiq_db',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
    
    // We don't cache everything in map for SQL notifications potentially?
    // Actually, NotificationManager sends notifications by iterating ALL channels.
    // So caching them in memory is efficient, provided we refresh on updates.
    // Or we can just query DB every time notifyStatusChange is called?
    // Querying DB is safer for scaling. But NotificationManager logic (as separate from repo)
    // expects to get channels.
    // Let's implement getAllChannels by querying DB.
  }

  async getAllChannels(): Promise<NotificationChannel[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM notification_channels');
    
    return rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      type: row.type,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      events: typeof row.events === 'string' ? JSON.parse(row.events) : row.events,
      enabled: Boolean(row.enabled)
    }));
  }

  async getChannelById(id: string): Promise<NotificationChannel | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM notification_channels WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    
    const row = rows[0];
    return {
      id: row.id.toString(),
      name: row.name,
      type: row.type,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      events: typeof row.events === 'string' ? JSON.parse(row.events) : row.events,
      enabled: Boolean(row.enabled)
    };
  }

  async addChannel(channel: Omit<NotificationChannel, 'id'>): Promise<NotificationChannel> {
    const connection = await this.pool.getConnection();
    try {
        const [result] = await connection.execute<ResultSetHeader>(
            'INSERT INTO notification_channels (name, type, config, events, enabled) VALUES (?, ?, ?, ?, ?)',
            [
              channel.name, 
              channel.type, 
              JSON.stringify(channel.config), 
              JSON.stringify(channel.events),
              channel.enabled
            ]
        );
        
        const newId = result.insertId.toString();
        
        return {
            id: newId,
            ...channel
        };
    } finally {
        connection.release();
    }
  }

  async updateChannel(id: string, updates: Partial<NotificationChannel>): Promise<NotificationChannel> {
    // First get existing
    const existing = await this.getChannelById(id);
    if (!existing) throw new Error('Channel not found');
    
    const merged = { ...existing, ...updates };
    
    await this.pool.execute(
        'UPDATE notification_channels SET name = ?, type = ?, config = ?, events = ?, enabled = ? WHERE id = ?',
         [
              merged.name, 
              merged.type, 
              JSON.stringify(merged.config), 
              JSON.stringify(merged.events),
              merged.enabled,
              id
         ]
    );
    
    return merged;
  }

  async deleteChannel(id: string): Promise<void> {
    await this.pool.execute('DELETE FROM notification_channels WHERE id = ?', [id]);
  }
}
