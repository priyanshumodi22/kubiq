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
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || 'kubiq_db',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    await this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) NOT NULL UNIQUE,
            email VARCHAR(255) UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(50) DEFAULT 'kubiq-viewer',
            allowed_namespaces TEXT NULL,
            enabled BOOLEAN DEFAULT TRUE,
            last_login TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
      `);

      // Migration: Add allowed_namespaces column if upgrading existing database
      try {
        await connection.query('ALTER TABLE users ADD COLUMN allowed_namespaces TEXT NULL');
      } catch {
        // Column already exists, ignore
      }

    } catch (e) {
      console.error('❌ MySQL User Schema Migration Failed:', e);
      throw e;
    } finally {
      connection.release();
    }
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
      const nsJson = user.allowedNamespaces ? JSON.stringify(user.allowedNamespaces) : null;
      const [result] = await connection.execute<ResultSetHeader>(
        'INSERT INTO users (username, email, password_hash, role, allowed_namespaces) VALUES (?, ?, ?, ?, ?)',
        [user.username, user.email || null, user.passwordHash || '', user.role, nsJson]
      );

      const newId = result.insertId.toString();
      const newUser: User = {
        id: newId,
        username: user.username,
        email: user.email,
        passwordHash: user.passwordHash,
        role: user.role,
        allowedNamespaces: user.allowedNamespaces,
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
    let allowedNamespaces: string[] | undefined;
    if (row.allowed_namespaces) {
      try {
        allowedNamespaces = typeof row.allowed_namespaces === 'string' ? JSON.parse(row.allowed_namespaces) : row.allowed_namespaces;
      } catch {
        allowedNamespaces = undefined;
      }
    }

    return {
      id: row.id.toString(),
      username: row.username,
      email: row.email,
      passwordHash: row.password_hash,
      role: row.role as UserRole,
      allowedNamespaces,
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
    if (user.allowedNamespaces !== undefined) {
      updates.push('allowed_namespaces = ?');
      values.push(user.allowedNamespaces ? JSON.stringify(user.allowedNamespaces) : null);
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
