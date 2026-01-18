
import mysql from 'mysql2/promise';
import { ISystemRepository } from '../../interfaces/ISystemRepository';
import { SystemMetrics } from '../../../types';

export class MysqlSystemRepository implements ISystemRepository {
  private pool: mysql.Pool | null = null;
  private readonly configKey = 'storage_prefs';

  async initialize(): Promise<void> {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || 'password',
      database: process.env.DB_NAME || 'kubiq',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // Auto-create table if not exists (Lazy Migration)
    await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS system_metrics (
            id INT AUTO_INCREMENT PRIMARY KEY,
            cpu_load FLOAT NOT NULL,
            memory_used BIGINT NOT NULL,
            memory_total BIGINT NOT NULL,
            disk_usage JSON NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_timestamp (timestamp)
        )
    `);

    await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS system_config (
            \`key\` VARCHAR(255) PRIMARY KEY,
            \`value\` JSON NOT NULL
        )
    `);
  }

  async saveMetrics(metrics: SystemMetrics): Promise<void> {
    if (!this.pool) await this.initialize();
    
    // Check connection first
    try {
        await this.pool!.query('SELECT 1');
    } catch {
        await this.initialize();
    }

    await this.pool!.execute(
      'INSERT INTO system_metrics (cpu_load, memory_used, memory_total, disk_usage, timestamp) VALUES (?, ?, ?, ?, FROM_UNIXTIME(?))',
      [
        metrics.cpuLoad,
        metrics.memory.used,
        metrics.memory.total,
        JSON.stringify(metrics.disks),
        (metrics.timestamp || Date.now()) / 1000
      ]
    );
  }

  async getMetricsHistory(limit: number = 24 * 7): Promise<SystemMetrics[]> { // Default 1 week of hourly data
    if (!this.pool) await this.initialize();

    const [rows]: any = await this.pool!.query(
      'SELECT * FROM system_metrics ORDER BY timestamp DESC LIMIT ?',
      [limit]
    );

    return rows.map((row: any) => ({
      cpuLoad: row.cpu_load,
      memory: {
        total: parseInt(row.memory_total),
        used: parseInt(row.memory_used),
        active: parseInt(row.memory_used) // Approximation if not stored
      },
      uptime: 0, // Not stored in history currently
      disks: typeof row.disk_usage === 'string' ? JSON.parse(row.disk_usage) : row.disk_usage,
      timestamp: new Date(row.timestamp).getTime()
    })).reverse(); // Oldest first for trends
  }

  async getStorageConfig(): Promise<{ allowedMounts: string[] }> {
    if (!this.pool) await this.initialize();
    
    const [rows]: any = await this.pool!.query(
        'SELECT value FROM system_config WHERE `key` = ?',
        [this.configKey]
    );

    if (rows.length > 0) {
        return rows[0].value; // JSON column automatically parsed by mysql2
    }
    
    return { allowedMounts: [] }; // Default empty
  }

  async updateStorageConfig(config: { allowedMounts: string[] }): Promise<void> {
    if (!this.pool) await this.initialize();

    await this.pool!.execute(
        'INSERT INTO system_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
        [this.configKey, JSON.stringify(config), JSON.stringify(config)]
    );
  }
}
