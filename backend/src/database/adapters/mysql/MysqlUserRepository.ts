import mysql, { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { IUserRepository } from '../../interfaces/IUserRepository';
import { User, UserRole } from '../../../types';

export class MysqlUserRepository implements IUserRepository {
  private pool!: Pool;

  async initialize(): Promise<void> {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'kubiq_db',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }

  async findByUsername(username: string): Promise<User | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length === 0) return null;
    return this.mapRowToUser(rows[0]);
  }

  async findById(id: string): Promise<User | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM users WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    return this.mapRowToUser(rows[0]);
  }

  async createUser(user: Omit<User, 'id' | 'createdAt' | 'lastLogin'>): Promise<User> {
    const connection = await this.pool.getConnection();
    try {
        const [result] = await connection.execute<ResultSetHeader>(
            'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
            [user.username, user.email || null, user.passwordHash || '', user.role]
        );
        
        const newId = result.insertId.toString();
        const newUser: User = {
            id: newId,
            username: user.username,
            email: user.email,
            passwordHash: user.passwordHash,
            role: user.role,
            createdAt: Date.now(),
            lastLogin: undefined,
            enabled: true
        };
        return newUser;
    } finally {
        connection.release();
    }
  }

  async updateUserRole(id: string, role: UserRole): Promise<User> {
    await this.pool.execute('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    const updated = await this.findById(id);
    if (!updated) throw new Error('User not found after update');
    return updated;
  }

  async updateUserStatus(id: string, enabled: boolean): Promise<User> {
      await this.pool.execute('UPDATE users SET enabled = ? WHERE id = ?', [enabled, id]);
      const updated = await this.findById(id);
      if (!updated) throw new Error('User not found after update');
      return updated;
  }

  async deleteUser(id: string): Promise<void> {
    await this.pool.execute('DELETE FROM users WHERE id = ?', [id]);
  }

  async getAllUsers(): Promise<User[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM users');
    return rows.map(r => this.mapRowToUser(r));
  }

  async updateLastLogin(id: string): Promise<void> {
      await this.pool.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [id]);
  }

  private mapRowToUser(row: any): User {
      return {
          id: row.id.toString(),
          username: row.username,
          email: row.email,
          passwordHash: row.password_hash,
          role: row.role as UserRole,
          createdAt: row.created_at ? new Date(row.created_at).getTime() : undefined,
          lastLogin: row.last_login ? new Date(row.last_login).getTime() : undefined,
          enabled: row.enabled !== 0 // MySQL stores boolean as tinyint
      };
  }
  async updateUser(id: string, user: Partial<User>): Promise<User> {
      const updates: string[] = [];
      const values: any[] = [];
      
      if (user.username) {
          updates.push('username = ?');
          values.push(user.username);
      }
      if (user.email !== undefined) {
          updates.push('email = ?');
          values.push(user.email);
      }
      
      if (updates.length > 0) {
          values.push(id);
          await this.pool.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
      }
      
      const updated = await this.findById(id);
      if (!updated) throw new Error('User not found after update');
      return updated;
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
      await this.pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
  }
}
