import mysql, { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { IServiceRepository } from '../../interfaces/IServiceRepository';
import { ServiceStatus, ServiceConfig, HealthCheck, SystemConfig } from '../../../types';

export class MysqlServiceRepository implements IServiceRepository {
  private pool!: Pool;
  private services: Map<string, ServiceStatus> = new Map();

  async getSystemConfig(): Promise<SystemConfig> {
    const defaultConfig: SystemConfig = {
      slug: null,
      dashboardTitle: 'System Status',
      refreshInterval: 300,
    };

    try {
        const [rows] = await this.pool.query<RowDataPacket[]>(
            'SELECT value FROM system_config WHERE `key` = ?', 
            ['status_page']
        );
        
        if (rows.length > 0) {
            const config = JSON.parse(rows[0].value);
            return { ...defaultConfig, ...config };
        }
    } catch (error) {
        console.error('❌ Error loading system config from MySQL:', error);
    }
    return defaultConfig;
  }

  async saveSystemConfig(config: SystemConfig): Promise<void> {
    try {
        const value = JSON.stringify(config);
        const connection = await this.pool.getConnection();
        try {
            // Upsert
            await connection.execute(
                'INSERT INTO system_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
                ['status_page', value, value]
            );
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('❌ Error saving system config to MySQL:', error);
    }
  }

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
       multipleStatements: true 
    }); 
    
    // Test connection
    try {
        const connection = await this.pool.getConnection();
        connection.release();
        console.log('✅ Connected to MySQL Database');
        
        await this.ensureSchema(); // Auto-migrate
        await this.loadInitialState();
    } catch(err) {
        console.error('❌ Failed to connect to MySQL:', err);
        throw err;
    }
  }

  private async ensureSchema(): Promise<void> {
      const connection = await this.pool.getConnection();
      try {
          // Create tables if not exist
          await connection.query(`
            CREATE TABLE IF NOT EXISTS services (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                endpoint VARCHAR(512) NOT NULL,
                type VARCHAR(50) DEFAULT 'http',
                headers TEXT,
                current_status VARCHAR(50),
                ssl_expiry DATETIME,
                ignore_ssl BOOLEAN DEFAULT FALSE,
                log_path VARCHAR(512),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB;

            CREATE TABLE IF NOT EXISTS service_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                service_id INT NOT NULL,
                timestamp DATETIME NOT NULL,
                status INT,
                success BOOLEAN,
                response_time INT,
                error TEXT,
                FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
                INDEX idx_service_timestamp (service_id, timestamp)
            ) ENGINE=InnoDB;
            
            CREATE TABLE IF NOT EXISTS system_config (
                \`key\` VARCHAR(50) PRIMARY KEY,
                \`value\` TEXT
            ) ENGINE=InnoDB;
          `);
          
          // Check for missing columns in 'services' (Migration for existing DBs)
          const [columns] = await connection.query<RowDataPacket[]>('SHOW COLUMNS FROM services');
          const columnNames = columns.map(c => c.Field);
          
          if (!columnNames.includes('ignore_ssl')) {
              console.log('🔧 Migrating MySQL: Adding ignore_ssl column');
              await connection.query('ALTER TABLE services ADD COLUMN ignore_ssl BOOLEAN DEFAULT FALSE');
          }
           if (!columnNames.includes('ssl_expiry')) {
               console.log('🔧 Migrating MySQL: Adding ssl_expiry column');
               await connection.query('ALTER TABLE services ADD COLUMN ssl_expiry DATETIME');
          }
          if (!columnNames.includes('log_path')) {
              console.log('🔧 Migrating MySQL: Adding log_path column');
              await connection.query('ALTER TABLE services ADD COLUMN log_path VARCHAR(512)');
          }
          if (!columnNames.includes('log_sources')) {
              console.log('🔧 Migrating MySQL: Adding log_sources column');
              await connection.query('ALTER TABLE services ADD COLUMN log_sources TEXT');
          }
          
      } catch (e) {
          console.error('❌ MySQL Schema Migration Failed:', e);
          throw e; // Critical failure
      } finally {
          connection.release();
      }
  }

  private async loadInitialState(): Promise<void> {
    // Load all services
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM services');
    
    for (const row of rows) {
      const service: ServiceStatus = {
        name: row.name,
        endpoint: row.endpoint,
        type: row.type as any || 'http',
        headers: typeof row.headers === 'string' ? JSON.parse(row.headers) : (row.headers || undefined),
        ignoreSSL: Boolean(row.ignore_ssl),
        sslExpiry: row.ssl_expiry ? new Date(row.ssl_expiry) : null,
        logPath: row.log_path || undefined,
        logSources: (() => {
            try { return row.log_sources ? JSON.parse(row.log_sources) : undefined; }
            catch { return undefined; }
        })(),
        currentStatus: row.current_status || 'unknown',
        history: [], // History loaded lazily or separate query?
        // If we load history here it might be heavy. 
        // But ServiceMonitor expects history for calculating stats.
        // Let's load last 50 checks for each service.
      };
      
      // Load recent history
      const [historyRows] = await this.pool.query<RowDataPacket[]>(
        'SELECT * FROM service_history WHERE service_id = ? ORDER BY timestamp DESC LIMIT 50', 
        [row.id]
      );
      
      service.history = historyRows.map(h => ({
          status: h.status,
          responseTime: h.response_time,
          timestamp: new Date(h.timestamp).getTime(),
          success: Boolean(h.success),
          error: h.error
      })).reverse(); // Oldest first for memory array
      
      this.services.set(row.name, service);
    }
  }

  async getAllServices(): Promise<ServiceStatus[]> {
    // In SQL repo, we might return cached Map for speed or query DB?
    // ServiceMonitor uses this for polling. Returning local Map is faster.
    // But modifying it happens via add/update/delete which updates DB + Map.
    return Array.from(this.services.values());
  }

  async getServiceByName(name: string): Promise<ServiceStatus | null> {
    return this.services.get(name) || null;
  }

  async addService(config: ServiceConfig): Promise<ServiceStatus> {
    if (this.services.has(config.name)) {
      throw new Error(`Service ${config.name} already exists`);
    }

    const connection = await this.pool.getConnection();
    try {
        await connection.beginTransaction();

        const [result] = await connection.execute<ResultSetHeader>(
            'INSERT INTO services (name, endpoint, type, headers, ignore_ssl, log_path, log_sources) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [config.name, config.endpoint, config.type || 'http', JSON.stringify(config.headers || {}), config.ignoreSSL || false, config.logPath || null, JSON.stringify(config.logSources || [])]
        );
        
        const newService: ServiceStatus = {
            name: config.name,
            endpoint: config.endpoint,
            type: config.type || 'http',
            headers: config.headers,
            ignoreSSL: config.ignoreSSL,
            logPath: config.logPath,
            logSources: config.logSources,
            sslExpiry: null,
            currentStatus: 'unknown',
            history: []
        };
        
        this.services.set(config.name, newService);
        
        await connection.commit();
        return newService;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
  }

  async updateService(name: string, config: Partial<ServiceConfig>): Promise<ServiceStatus> {
    const service = this.services.get(name);
    if (!service) throw new Error(`Service ${name} not found`);

    if (config.endpoint) service.endpoint = config.endpoint;
    if (config.type) service.type = config.type;
    if (config.headers) service.headers = config.headers;
    if (config.ignoreSSL !== undefined) service.ignoreSSL = config.ignoreSSL;
    if (config.logPath !== undefined) service.logPath = config.logPath;
    if (config.logSources !== undefined) service.logSources = config.logSources;
    
    // Update DB with merged service state
    await this.pool.execute(
        'UPDATE services SET endpoint = ?, type = ?, headers = ?, ignore_ssl = ?, log_path = ?, log_sources = ? WHERE name = ?',
        [
            service.endpoint, 
            service.type || 'http', 
            JSON.stringify(service.headers || {}), 
            service.ignoreSSL || false, 
            service.logPath || null, 
            JSON.stringify(service.logSources || []),
            name
        ]
    );

    this.services.set(name, service);
    return service;
  }

  async deleteService(name: string): Promise<void> {
    if (!this.services.has(name)) throw new Error(`Service ${name} not found`);
    
    await this.pool.execute('DELETE FROM services WHERE name = ?', [name]);
    this.services.delete(name);
  }

  async saveCheckResult(serviceName: string, result: HealthCheck, extraData?: { sslExpiry?: Date | null }): Promise<void> {
    const service = this.services.get(serviceName);
    if (!service) return;

    // Update in-memory state
    if (extraData && extraData.sslExpiry !== undefined) {
        service.sslExpiry = extraData.sslExpiry;
    }
    
    const [rows] = await this.pool.execute<RowDataPacket[]>('SELECT id FROM services WHERE name = ?', [serviceName]);
    if (!rows.length) return;
    const serviceId = rows[0].id;
    
    try {
        await this.pool.execute(
            'INSERT INTO service_history (service_id, timestamp, response_time, status, success, error) VALUES (?, ?, ?, ?, ?, ?)',
            [
                serviceId, 
                new Date(result.timestamp), 
                result.responseTime, 
                result.status, 
                result.success, 
                result.error || null
            ]
        );
        
        // Update current status in services table
        if (extraData && extraData.sslExpiry !== undefined) {
             await this.pool.execute(
                'UPDATE services SET current_status = ?, updated_at = NOW(), ssl_expiry = ? WHERE id = ?',
                [result.success ? 'healthy' : 'unhealthy', extraData.sslExpiry, serviceId]
            );
        } else {
            await this.pool.execute(
                'UPDATE services SET current_status = ?, updated_at = NOW() WHERE id = ?',
                [result.success ? 'healthy' : 'unhealthy', serviceId]
            );
        }
        
    } catch(err) {
        console.error(`Failed to save check result for ${serviceName}`, err);
    }
  }

  async getServiceHistory(serviceName: string, limit: number = 20): Promise<HealthCheck[]> {
    const service = this.services.get(serviceName);
    if (!service) return [];
    
    // If memory already has it (from ServiceMonitor cache), return it?
    // ServiceMonitor calls this only if it needs it. 
    // Actually ServiceMonitor has its own history array.
    // This method might be used for API to fetch deeper history.
    
    // Fetch from DB
    const [rows] = await this.pool.execute<RowDataPacket[]>('SELECT id FROM services WHERE name = ?', [serviceName]);
    if (!rows.length) return [];
    const serviceId = rows[0].id;
    
    const [historyRows] = await this.pool.query<RowDataPacket[]>(
        'SELECT * FROM service_history WHERE service_id = ? ORDER BY timestamp DESC LIMIT ?', 
        [serviceId, limit]
    );

    return historyRows.map(h => ({
          status: h.status,
          responseTime: h.response_time,
          timestamp: new Date(h.timestamp).getTime(),
          success: Boolean(h.success),
          error: h.error
      })).reverse();
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
