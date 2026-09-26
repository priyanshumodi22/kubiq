import mysql, { Pool, RowDataPacket } from 'mysql2/promise';
import { IAuditLogRepository } from '../../interfaces/IAuditLogRepository';
import { AuditLogEntry } from '../../../services/AuditLogService';

export class MysqlAuditLogRepository implements IAuditLogRepository {
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
        CREATE TABLE IF NOT EXISTS audit_logs (
          id VARCHAR(255) PRIMARY KEY,
          timestamp VARCHAR(255) NOT NULL,
          user VARCHAR(255) NOT NULL,
          action VARCHAR(255) NOT NULL,
          target TEXT NOT NULL,
          details TEXT,
          ip VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_audit_timestamp (timestamp),
          INDEX idx_audit_user (user),
          INDEX idx_audit_action (action)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    } finally {
      connection.release();
    }
  }

  public async addAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
    const fullEntry: AuditLogEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...entry
    };

    await this.pool.execute(
      `INSERT INTO audit_logs (id, timestamp, user, action, target, details, ip) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        fullEntry.id,
        fullEntry.timestamp,
        fullEntry.user,
        fullEntry.action,
        fullEntry.target,
        fullEntry.details || null,
        fullEntry.ip || null
      ]
    );

    return fullEntry;
  }

  public async getAuditLogs(limit: number = 100, search?: string): Promise<AuditLogEntry[]> {
    let sql = `SELECT id, timestamp, user, action, target, details, ip FROM audit_logs`;
    const params: any[] = [];

    if (search && search.trim()) {
      sql += ` WHERE user LIKE ? OR action LIKE ? OR target LIKE ? OR details LIKE ?`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 1000));
    sql += ` ORDER BY timestamp DESC LIMIT ${safeLimit}`;

    const [rows] = await this.pool.query<RowDataPacket[]>(sql, params);
    return rows.map((r: any) => ({
      id: r.id,
      timestamp: r.timestamp,
      user: r.user,
      action: r.action,
      target: r.target,
      details: r.details || undefined,
      ip: r.ip || undefined
    }));
  }
}
