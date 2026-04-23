import axios, { AxiosError } from 'axios';
import NodeCache from 'node-cache';
import { ServiceConfig, HealthCheck, ServiceStatus, SystemConfig } from '../types';
import mysql from 'mysql2/promise';
import mongoose from 'mongoose';
import net from 'net';
import https from 'https';
import tls from 'tls';
import { URL } from 'url';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { IServiceRepository } from '../database/interfaces/IServiceRepository';

export class ServiceMonitor {
  private static instance: ServiceMonitor;
  private services: Map<string, ServiceStatus> = new Map();
  private repository!: IServiceRepository;
  private cache: NodeCache;
  private pollIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;
  private readonly maxHistorySize: number;
  private readonly pollInterval: number;
  private readonly requestTimeout: number;
  private readonly persistenceEnabled: boolean;
  private readonly dataDir: string;
  private persistenceInterval?: NodeJS.Timeout;
  private statusConfig: SystemConfig = {
    slug: null,
    dashboardTitle: 'System Status',
    refreshInterval: 300,
  };

  // --- Scalability: Semaphore (Concurrency Limiter) ---
  private readonly maxConcurrentChecks: number;
  private activeChecks: number = 0;
  private checkQueue: Array<() => void> = [];

  // --- Scalability: DB Connection Pools ---
  private mysqlPools: Map<string, mysql.Pool> = new Map();
  private mongoConnections: Map<string, mongoose.Connection> = new Map();

  private constructor() {
    this.maxHistorySize = parseInt(process.env.MAX_HISTORY_SIZE || '6000', 10);
    this.pollInterval = parseInt(process.env.POLL_INTERVAL || '30000', 10);
    this.requestTimeout = parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000', 10);
    this.persistenceEnabled = process.env.ENABLE_PERSISTENCE === 'true';
    this.dataDir = process.env.DATA_DIR || './data';
    this.maxConcurrentChecks = parseInt(process.env.MAX_CONCURRENT_CHECKS || '10', 10);

    this.cache = new NodeCache({ stdTTL: 60, checkperiod: 120 });
  }

  public static getInstance(): ServiceMonitor {
    if (!ServiceMonitor.instance) {
      ServiceMonitor.instance = new ServiceMonitor();
    }
    return ServiceMonitor.instance;
  }

  public async initialize(): Promise<void> {
    try {
      this.repository = await DatabaseFactory.getServiceRepository();
      console.log('🔌 Database Repository Initialized');

      const services = await this.repository.getAllServices();
      this.services.clear();
      services.forEach(s => this.services.set(s.name, s));
      console.log(`📋 Loaded ${this.services.size} services from repository`);

      this.statusConfig = await this.repository.getSystemConfig();
      console.log(`⚙️  Loaded System Config (Title: ${this.statusConfig.dashboardTitle})`);

      if (this.services.size === 0) {
        console.log('⚠️  No services configured');
      }
    } catch (error) {
      console.error('❌ Failed to initialize ServiceMonitor:', error);
      throw error;
    }
  }

  // --- Semaphore: acquire a slot before running a check ---
  private acquireSemaphore(): Promise<() => void> {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        if (this.activeChecks < this.maxConcurrentChecks) {
          this.activeChecks++;
          resolve(() => this.releaseSemaphore());
        } else {
          this.checkQueue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }

  private releaseSemaphore(): void {
    this.activeChecks--;
    if (this.checkQueue.length > 0) {
      const next = this.checkQueue.shift()!;
      next();
    }
  }

  // --- Core Monitoring Logic ---

  public async checkServiceHealth(serviceName: string): Promise<HealthCheck> {
    const release = await this.acquireSemaphore();
    try {
      return await this.checkServiceHealthInternal(serviceName);
    } finally {
      release();
    }
  }

  private async checkServiceHealthInternal(serviceName: string): Promise<HealthCheck> {
    const service = this.services.get(serviceName);
    if (!service) throw new Error(`Service ${serviceName} not found`);

    const startTime = Date.now();
    let check: HealthCheck;

    try {
      if (service.type === 'tcp') {
        const success = await this.checkTcp(service.endpoint);
        check = {
          status: success ? 200 : 0,
          responseTime: Date.now() - startTime,
          timestamp: Date.now(),
          success,
          error: success ? undefined : 'Connection Refused',
        };
      } else if (service.type === 'mysql') {
        const success = await this.checkMysql(service.endpoint);
        check = {
          status: success ? 200 : 0,
          responseTime: Date.now() - startTime,
          timestamp: Date.now(),
          success,
          error: success ? undefined : 'Connection Failed',
        };
      } else if (service.type === 'mongodb') {
        const success = await this.checkMongo(service.endpoint);
        check = {
          status: success ? 200 : 0,
          responseTime: Date.now() - startTime,
          timestamp: Date.now(),
          success,
          error: success ? undefined : 'Connection Failed',
        };
      } else {
        // HTTP/HTTPS Default
        const isHttps = service.endpoint.startsWith('https:');
        const httpsAgent = isHttps
          ? new https.Agent({ rejectUnauthorized: !service.ignoreSSL, keepAlive: false })
          : undefined;

        const response = await axios.get(service.endpoint, {
          timeout: this.requestTimeout,
          maxRedirects: 0,
          validateStatus: () => true,
          headers: service.headers || {},
          httpsAgent,
        });

        if (isHttps) {
          let cert: any = response.request?.res?.socket?.getPeerCertificate?.();
          if ((!cert || Object.keys(cert).length === 0) && response.status < 400) {
            try {
              cert = await this.checkTlsRaw(service.endpoint);
            } catch (tlsErr) {
              console.warn(`TLS Fallback Failed for ${service.name}`, tlsErr);
            }
          }
          if (cert && cert.valid_to) {
            service.sslExpiry = new Date(cert.valid_to);
          }
        }

        const success = response.status >= 200 && response.status < 400;
        check = {
          status: response.status,
          responseTime: Date.now() - startTime,
          timestamp: Date.now(),
          success,
          error: success ? undefined : `Status Code: ${response.status}`,
        };
      }

      await this.updateServiceState(service, check);
      return check;
    } catch (error: any) {
      check = {
        status: 0,
        responseTime: Date.now() - startTime,
        timestamp: Date.now(),
        success: false,
        error: error.message || 'Check Failed',
      };
      await this.updateServiceState(service, check);
      return check;
    }
  }

  private async updateServiceState(service: ServiceStatus, check: HealthCheck): Promise<void> {
    const oldStatus = service.currentStatus;
    const newStatus = check.success ? 'healthy' : 'unhealthy';
    const serviceName = service.name;

    service.lastCheck = check;
    service.currentStatus = newStatus;
    service.history.push(check);
    if (service.history.length > this.maxHistorySize) service.history.shift();
    this.updateStats(service);

    if (oldStatus !== 'unknown' && oldStatus !== newStatus) {
      const NotificationManager = require('../services/NotificationManager').NotificationManager;
      NotificationManager.getInstance().notifyStatusChange(
        serviceName,
        newStatus,
        check.success ? undefined : (check.error || `Status Code: ${check.status}`)
      );
    }

    try {
      await this.repository.saveCheckResult(serviceName, check, { sslExpiry: service.sslExpiry });
    } catch (err) {
      console.error(`Failed to persist check result for ${serviceName}`, err);
    }
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.services.forEach(service => this.startPolling(service.name));
    console.log(`🚀 Service Monitoring Started (max concurrency: ${this.maxConcurrentChecks})`);
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    this.pollIntervals.forEach(interval => clearInterval(interval));
    this.pollIntervals.clear();

    // Clean up MySQL pools
    this.mysqlPools.forEach((pool, key) =>
      pool.end().catch(err => console.error(`Failed to close MySQL pool [${key}]:`, err))
    );
    this.mysqlPools.clear();

    // Clean up MongoDB persistent connections
    this.mongoConnections.forEach((conn, key) =>
      conn.close().catch(err => console.error(`Failed to close MongoDB conn [${key}]:`, err))
    );
    this.mongoConnections.clear();

    // Drain semaphore queue
    this.checkQueue = [];
    this.activeChecks = 0;

    if (this.repository) this.repository.close();
    console.log('🛑 Service Monitoring Stopped');
  }

  private startPolling(serviceName: string): void {
    if (this.pollIntervals.has(serviceName)) return;

    const service = this.services.get(serviceName);

    // Per-service interval: service.interval is in ms (same unit as POLL_INTERVAL env var)
    // Falls back to global POLL_INTERVAL if not set per-service
    const effectiveInterval = service?.interval || this.pollInterval;

    const runCheck = () => {
      this.checkServiceHealthWithSemaphore(serviceName).catch(console.error);
    };

    // Jitter: randomize the initial check within [0, effectiveInterval]
    // Staggers checks across time to prevent thundering herd on startup
    const jitter = Math.floor(Math.random() * effectiveInterval);
    setTimeout(runCheck, jitter);

    const interval = setInterval(runCheck, effectiveInterval);
    this.pollIntervals.set(serviceName, interval);
  }

  /** @deprecated Internal use only — use checkServiceHealth() which includes the semaphore */
  private async checkServiceHealthWithSemaphore(serviceName: string): Promise<HealthCheck> {
    return this.checkServiceHealth(serviceName);
  }

  // --- CRUD Operations ---

  public getAllServices(): ServiceStatus[] {
    return Array.from(this.services.values());
  }

  public getServiceByName(name: string): ServiceStatus | undefined {
    return this.services.get(name);
  }

  private checkTcp(endpoint: string): Promise<boolean> {
    return new Promise((resolve) => {
      const [host, portStr] = endpoint.split(':');
      const port = parseInt(portStr);

      if (!host || isNaN(port)) { resolve(false); return; }

      const socket = new net.Socket();
      socket.setTimeout(this.requestTimeout);
      socket.on('connect', () => { socket.destroy(); resolve(true); });
      socket.on('error', () => resolve(false));
      socket.on('timeout', () => { socket.destroy(); resolve(false); });
      socket.connect(port, host);
    });
  }

  private checkTlsRaw(urlStr: string): Promise<any> {
    return new Promise((resolve) => {
      try {
        const u = new URL(urlStr);
        const port = u.port ? parseInt(u.port, 10) : 443;
        const socket = tls.connect(
          { host: u.hostname, port, servername: u.hostname, rejectUnauthorized: false },
          () => { const cert = socket.getPeerCertificate(); socket.end(); resolve(cert); }
        );
        socket.on('error', () => resolve(null));
        socket.setTimeout(this.requestTimeout, () => { socket.destroy(); resolve(null); });
      } catch { resolve(null); }
    });
  }

  // --- Scalability: MySQL Connection Pool ---

  /**
   * Returns a shared pool for a given connection string.
   * Created once per unique URI; reused on every subsequent check.
   */
  private getMysqlPool(connectionString: string): mysql.Pool {
    if (!this.mysqlPools.has(connectionString)) {
      const pool = mysql.createPool(connectionString);
      this.mysqlPools.set(connectionString, pool);
      console.log('🐬 MySQL connection pool created for health checks');
    }
    return this.mysqlPools.get(connectionString)!;
  }

  private async checkMysql(connectionString: string): Promise<boolean> {
    const pool = this.getMysqlPool(connectionString);
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.ping();
      return true;
    } catch {
      return false;
    } finally {
      // Release back to pool — NOT destroyed (this is the key improvement)
      if (connection) connection.release();
    }
  }

  // --- Scalability: MongoDB Persistent Connection ---

  /**
   * Returns a persistent mongoose.Connection for a given URI.
   * Reconnects automatically if the connection has dropped (readyState !== 1).
   */
  private async getMongoConnection(connectionString: string): Promise<mongoose.Connection> {
    if (this.mongoConnections.has(connectionString)) {
      const conn = this.mongoConnections.get(connectionString)!;
      if (conn.readyState === 1) return conn; // 1 = connected
      this.mongoConnections.delete(connectionString); // stale — reconnect below
    }

    const conn = await mongoose.createConnection(connectionString, {
      serverSelectionTimeoutMS: this.requestTimeout,
      connectTimeoutMS: this.requestTimeout,
    }).asPromise();

    this.mongoConnections.set(connectionString, conn);
    console.log('🍃 MongoDB persistent connection established for health checks');
    return conn;
  }

  private async checkMongo(connectionString: string): Promise<boolean> {
    try {
      const conn = await this.getMongoConnection(connectionString);
      await conn.db!.command({ ping: 1 }); // db is defined when readyState === 1
      return true;
    } catch {
      this.mongoConnections.delete(connectionString); // force reconnect next cycle
      return false;
    }
  }

  public async addService(config: ServiceConfig): Promise<ServiceStatus> {
    const newService = await this.repository.addService(config);
    this.services.set(newService.name, newService);
    if (this.isRunning) this.startPolling(newService.name);
    return newService;
  }

  public async updateService(name: string, config: Partial<ServiceConfig>): Promise<ServiceStatus> {
    const updatedService = await this.repository.updateService(name, config);
    this.updateStats(updatedService);
    this.services.set(name, updatedService);

    // Restart polling so interval/endpoint changes take effect immediately
    if (this.isRunning) {
      clearInterval(this.pollIntervals.get(name));
      this.pollIntervals.delete(name);
      this.startPolling(name);
    }

    return updatedService;
  }

  public async deleteService(name: string): Promise<void> {
    await this.repository.deleteService(name);
    this.services.delete(name);
    if (this.pollIntervals.has(name)) {
      clearInterval(this.pollIntervals.get(name));
      this.pollIntervals.delete(name);
    }
  }

  // --- System Config ---

  public getStatusPageConfig(): SystemConfig {
    return { ...this.statusConfig };
  }

  public async updateStatusPageConfig(config: Partial<SystemConfig>): Promise<SystemConfig> {
    this.statusConfig = { ...this.statusConfig, ...config };
    await this.repository.saveSystemConfig(this.statusConfig);
    return this.statusConfig;
  }

  // --- Custom Endpoint Check ---

  public async customEndpointCheck(
    serviceName: string,
    endpoint: string,
    method: string = 'GET',
    headers: Record<string, string> = {},
    body?: any
  ): Promise<any> {
    const service = this.services.get(serviceName);
    if (!service) throw new Error(`Service ${serviceName} not found`);

    const baseEndpoint = service.endpoint.replace(/\/$/, '');
    const customPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const fullUrl = `${baseEndpoint}${customPath}`;
    const startTime = Date.now();

    try {
      const mergedHeaders = { ...(service.headers || {}), ...headers };
      const isHttps = fullUrl.startsWith('https:');
      const httpsAgent =
        isHttps && service.ignoreSSL
          ? new https.Agent({ rejectUnauthorized: false, keepAlive: false })
          : undefined;

      const response = await axios({
        url: fullUrl,
        method,
        headers: mergedHeaders,
        data: body,
        timeout: this.requestTimeout,
        maxRedirects: 0,
        validateStatus: () => true,
        httpsAgent,
      });

      return {
        status: 'success',
        data: response.data,
        responseTime: Date.now() - startTime,
        statusCode: response.status,
        headers: response.headers,
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof AxiosError ? error.message : 'Unknown error',
        responseTime: Date.now() - startTime,
      };
    }
  }

  // --- Stats & History ---

  public getStats(): {
    totalServices: number;
    healthyServices: number;
    unhealthyServices: number;
    unknownServices: number;
    averageUptime: number;
    averageResponseTime: number;
  } {
    const services = Array.from(this.services.values());
    if (services.length === 0) {
      return { totalServices: 0, healthyServices: 0, unhealthyServices: 0, unknownServices: 0, averageUptime: 0, averageResponseTime: 0 };
    }

    const totalUptime = services.reduce((sum, s) => sum + (s.uptime || 0), 0);
    const totalResponseTime = services.reduce((sum, s) => sum + (s.averageResponseTime || 0), 0);
    const healthyServices = services.filter(s => s.currentStatus === 'healthy').length;
    const unhealthyServices = services.filter(s => s.currentStatus === 'unhealthy').length;
    const unknownServices = services.length - (healthyServices + unhealthyServices);

    return {
      totalServices: services.length,
      healthyServices,
      unhealthyServices,
      unknownServices,
      averageUptime: parseFloat((totalUptime / services.length).toFixed(2)),
      averageResponseTime: Math.round(totalResponseTime / services.length),
    };
  }

  public async getServiceHistory(serviceName: string, limit: number = 50): Promise<HealthCheck[]> {
    return this.repository.getServiceHistory(serviceName, limit);
  }

  private updateStats(service: ServiceStatus): void {
    const recent = service.history.slice(-20);
    const valid = recent.filter(c => c.success);
    if (valid.length) {
      service.averageResponseTime = valid.reduce((sum, c) => sum + c.responseTime, 0) / valid.length;
    }
    const successCount = service.history.filter(c => c.success).length;
    service.uptime = service.history.length ? (successCount / service.history.length) * 100 : 100;
  }
}
