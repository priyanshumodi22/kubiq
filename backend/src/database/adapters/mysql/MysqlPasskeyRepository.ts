import mysql, { Pool, RowDataPacket } from 'mysql2/promise';
import { IPasskeyRepository } from '../../interfaces/IPasskeyRepository';
import { Passkey } from '../../../types';

export class MysqlPasskeyRepository implements IPasskeyRepository {
  private pool!: Pool;

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
  }

  async create(passkey: Passkey): Promise<Passkey> {
    const connection = await this.pool.getConnection();
    try {
        await connection.execute(
            'INSERT INTO passkeys (id, public_key, user_id, webauthn_user_id, name, counter, device_type, backed_up, transports, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?/1000))',
            [
                passkey.id,
                passkey.publicKey,
                passkey.userId,
                passkey.webAuthnUserID,
                passkey.name,
                passkey.counter,
                passkey.deviceType,
                passkey.backedUp ? 1 : 0,
                JSON.stringify(passkey.transports),
                passkey.createdAt
            ]
        );
        return passkey;
    } finally {
        connection.release();
    }
  }

  async findById(id: string): Promise<Passkey | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM passkeys WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    return this.mapRowToPasskey(rows[0]);
  }

  async findByUserId(userId: string): Promise<Passkey[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM passkeys WHERE user_id = ?', [userId]);
    return rows.map(r => this.mapRowToPasskey(r));
  }

  async updateCounter(id: string, newCounter: number): Promise<void> {
    await this.pool.execute('UPDATE passkeys SET counter = ? WHERE id = ?', [newCounter, id]);
  }

  async updateName(id: string, name: string): Promise<void> {
    await this.pool.execute('UPDATE passkeys SET name = ? WHERE id = ?', [name, id]);
  }

  async delete(id: string): Promise<boolean> {
    const [result] = await this.pool.execute('DELETE FROM passkeys WHERE id = ?', [id]);
    return (result as any).affectedRows > 0;
  }

  private mapRowToPasskey(row: any): Passkey {
      return {
          id: row.id,
          publicKey: row.public_key,
          userId: row.user_id,
          webAuthnUserID: row.webauthn_user_id,
          name: row.name || 'My Passkey',
          counter: row.counter,
          deviceType: row.device_type,
          backedUp: row.backed_up === 1,
          transports: typeof row.transports === 'string' ? JSON.parse(row.transports) : row.transports || [],
          createdAt: new Date(row.created_at).getTime(),
      };
  }
}
