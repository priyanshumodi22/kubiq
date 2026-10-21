import mysql, { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { IUserRepository } from '../../interfaces/IUserRepository';
import { User, UserRole } from '../../../types';

export class MysqlUserRepository implements IUserRepository {
  private pool!: Pool;

  async initialize(): Promise<void> {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: Number.parseInt(process.env.DB_PORT || '3306'),
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
            avatar_url LONGTEXT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(50) DEFAULT 'kubiq-viewer',
            roles TEXT NULL,
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
      try {
        await connection.query('ALTER TABLE users ADD COLUMN roles TEXT NULL');
      } catch {
        // Column already exists, ignore.
      }
      try {
        await connection.query('ALTER TABLE users ADD COLUMN avatar_url LONGTEXT NULL');
      } catch {
        // Column already exists, ignore.
      }
      // A display picture is a compressed data URL and can exceed MySQL TEXT's
      // 64 KiB limit. This is safe and idempotent for existing deployments.
      await connection.query('ALTER TABLE users MODIFY COLUMN avatar_url LONGTEXT NULL');

      // Access-preserving legacy migration. It is safe to run at every start:
      // only rows without a role array are written.
      await connection.query("UPDATE users SET roles = JSON_ARRAY(COALESCE(role, 'kubiq-viewer')) WHERE roles IS NULL OR roles = ''");

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
      const rolesJson = JSON.stringify(user.roles?.length ? user.roles : [user.role]);
      const [result] = await connection.execute<ResultSetHeader>(
        'INSERT INTO users (username, email, password_hash, role, roles, allowed_namespaces) VALUES (?, ?, ?, ?, ?, ?)',
        [user.username, user.email || null, user.passwordHash || '', user.role, rolesJson, nsJson]
      );

      const newId = result.insertId.toString();
      const newUser: User = {
        id: newId,
        username: user.username,
        email: user.email,
        passwordHash: user.passwordHash,
        role: user.role,
        roles: user.roles?.length ? user.roles : [user.role],
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
    await this.pool.execute('UPDATE users SET role = ?, roles = ? WHERE id = ?', [role, JSON.stringify([role]), id]);
    const updated = await this.findById(id);
    if (!updated) throw new Error('User not found after update');
    return updated;
  }

  async updateUserRoles(id: string, roles: string[]): Promise<User> {
    const normalized = [...new Set(roles.map(role => role.trim()).filter(Boolean))];
    if (normalized.length === 0) throw new Error('At least one role is required');
    await this.pool.execute('UPDATE users SET role = ?, roles = ? WHERE id = ?', [normalized[0], JSON.stringify(normalized), id]);
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
    let roles: string[] | undefined;
    if (row.roles) {
      try {
        roles = typeof row.roles === 'string' ? JSON.parse(row.roles) : row.roles;
      } catch { roles = undefined; }
    }
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
      avatarUrl: row.avatar_url,
      passwordHash: row.password_hash,
      role: row.role as UserRole,
      roles: Array.isArray(roles) && roles.length ? roles : [row.role as UserRole],
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
    if (user.avatarUrl !== undefined) {
      updates.push('avatar_url = ?');
      values.push(user.avatarUrl);
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
