import axios, { AxiosError, type AxiosResponse } from 'axios';
import NodeCache from 'node-cache';
import { ServiceConfig, HealthCheck, ServiceStatus, SystemConfig } from '../types';
import mysql from 'mysql2/promise';
import mongoose from 'mongoose';
import net from 'node:net';
import https from 'node:https';
import tls from 'node:tls';
import { URL } from 'node:url';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { IServiceRepository } from '../database/interfaces/IServiceRepository';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { KubernetesService, type KubePod } from './KubernetesService';
import { NotificationManager } from './NotificationManager';
import { endpointToIcmpHost } from '../utils/icmpTarget';
import { randomInt } from 'node:crypto';

const execFileAsync = promisify(execFile);
function reportNotificationFailure(error_: unknown): void {
  console.warn('Background monitor notification failed.', error_);
}
function checkFailureMessage(error_: unknown): string {
  if (error_ && typeof error_ === 'object' && 'message' in error_
    && typeof error_.message === 'string' && error_.message) return error_.message;
  return 'Check Failed';
}

export class ServiceMonitor {
  private static instance: ServiceMonitor;
  private readonly services: Map<string, ServiceStatus> = new Map();
  private readonly failureCounters: Map<string, number> = new Map();
  private repository!: IServiceRepository;
  private readonly cache: NodeCache;
  private readonly pollIntervals: Map<string, NodeJS.Timeout> = new Map();
  private readonly initialPollTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;
  private readonly maxHistorySize: number;
  private readonly pollInterval: number;
  private readonly requestTimeout: number;
  private readonly persistenceEnabled: boolean;
  private readonly dataDir: string;
  private readonly persistenceInterval?: NodeJS.Timeout;
  private statusConfig: SystemConfig = {
    slug: null,
    dashboardTitle: 'System Status',
    refreshInterval: 300,
  };

  // --- Scalability: Semaphore (Concurrency Limiter) ---
  private readonly maxConcurrentChecks: number;
  private activeChecks: number = 0;
  private checkQueue: Array<{ acquire: () => void; cancel: () => void }> = [];

  // --- Scalability: DB Connection Pools ---
  private readonly mysqlPools: Map<string, mysql.Pool> = new Map();
  private readonly mongoConnections: Map<string, mongoose.Connection> = new Map();

  private constructor() {
    this.maxHistorySize = Number.parseInt(process.env.MAX_HISTORY_SIZE || '6000', 10);
    this.pollInterval = Number.parseInt(process.env.POLL_INTERVAL || '30000', 10);
    this.requestTimeout = Number.parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000', 10);
    this.persistenceEnabled = process.env.ENABLE_PERSISTENCE === 'true';
    this.dataDir = process.env.DATA_DIR || './data';
    this.maxConcurrentChecks = Number.parseInt(process.env.MAX_CONCURRENT_CHECKS || '10', 10);

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
    return new Promise((resolve, reject) => {
      const tryAcquire = () => {
        if (this.activeChecks < this.maxConcurrentChecks) {
          this.activeChecks++;
          resolve(() => this.releaseSemaphore());
        } else {
          this.checkQueue.push({ acquire: tryAcquire, cancel: () => reject(new Error('Monitoring stopped before the queued check started')) });
        }
      };
      tryAcquire();
    });
  }

  private releaseSemaphore(): void {
    this.activeChecks--;
    if (this.checkQueue.length > 0) {
      const next = this.checkQueue.shift()!;
      next.acquire();
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
      check = await this.performServiceCheck(service, startTime);

      await this.updateServiceState(service, check);
      return check;
    } catch (error_) {
      check = {
        status: 0,
        responseTime: Date.now() - startTime,
        timestamp: Date.now(),
        success: false,
        error: checkFailureMessage(error_),
      };
      await this.updateServiceState(service, check);
      return check;
    }
  }

  private connectionResult(success: boolean, startTime: number, failureMessage: string): HealthCheck {
    return {
      status: success ? 200 : 0,
      responseTime: Date.now() - startTime,
      timestamp: Date.now(),
      success,
      error: success ? undefined : failureMessage,
    };
  }

  private async performServiceCheck(service: ServiceStatus, startTime: number): Promise<HealthCheck> {
    switch (service.type) {
      case 'tcp': return this.connectionResult(await this.checkTcp(service.endpoint), startTime, 'Connection Refused');
      case 'mysql': return this.connectionResult(await this.checkMysql(service.endpoint), startTime, 'Connection Failed');
      case 'mongodb': return this.connectionResult(await this.checkMongo(service.endpoint), startTime, 'Connection Failed');
      case 'icmp': return this.connectionResult(await this.checkIcmp(service.endpoint), startTime, 'Ping Failed');
      default: return this.checkHttp(service, startTime);
    }
  }

  private async updateCertificateExpiry(service: ServiceStatus, response: AxiosResponse): Promise<void> {
    let cert = response.request?.res?.socket?.getPeerCertificate?.();
    if ((!cert || Object.keys(cert).length === 0) && response.status < 400) {
      try {
        cert = await this.checkTlsRaw(service.endpoint);
      } catch (error_) {
        console.warn(`TLS Fallback Failed for ${service.name}`, error_);
      }
    }
    if (cert?.valid_to) service.sslExpiry = new Date(cert.valid_to);
  }

  private async checkHttp(service: ServiceStatus, startTime: number): Promise<HealthCheck> {
    const isHttps = service.endpoint.startsWith('https:');
    const httpsAgent = isHttps ? new https.Agent({ rejectUnauthorized: !service.ignoreSSL, keepAlive: false }) : undefined;
    const response = await axios.get(service.endpoint, {
      timeout: this.requestTimeout,
      maxRedirects: 0,
      validateStatus: () => true,
      headers: service.headers || {},
      httpsAgent,
    });
    if (isHttps) await this.updateCertificateExpiry(service, response);
    const success = response.status >= 200 && response.status < 400;
    return {
      status: response.status,
      responseTime: Date.now() - startTime,
      timestamp: Date.now(),
      success,
      error: success ? undefined : `Status Code: ${response.status}`,
    };
  }

  private async updateServiceState(service: ServiceStatus, check: HealthCheck): Promise<void> {
    const oldStatus = service.currentStatus;
    const serviceName = service.name;
    const requiredFailures = service.retries ?? 3; // Default to 3 retries if not specified

    // Track consecutive failures
    let consecutiveFailures = this.failureCounters.get(serviceName) || 0;
    
    if (check.success) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures += 1;
    }
    this.failureCounters.set(serviceName, consecutiveFailures);

    // Determine new status based on thresholds
    let newStatus = oldStatus;
    
    if (check.success) {
       newStatus = 'healthy';
    } else if (consecutiveFailures >= requiredFailures) {
       newStatus = 'unhealthy';
    }

    service.lastCheck = check;
    service.currentStatus = newStatus;
    service.history.push(check);
    if (service.history.length > this.maxHistorySize) service.history.shift();
    this.updateStats(service);

    if (oldStatus !== 'unknown' && newStatus !== 'unknown' && oldStatus !== newStatus) {
      const isDbService = service.type === 'mysql' || service.type === 'mongodb' || service.type === 'tcp' || /^(mongodb|mysql|postgres|redis|amqp)/i.test(service.endpoint || '');
      NotificationManager.getInstance().notifyStatusChange(
        serviceName,
        newStatus,
        check.success ? undefined : (check.error || `Status Code: ${check.status}`),
        {
          endpoint: isDbService ? undefined : service.endpoint,
          responseTime: check.responseTime,
          statusCode: check.status
        }
      ).catch(reportNotificationFailure);
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
    
    // Start K8s Cluster Alert Monitor (runs every 60s)
    const k8sInterval = setInterval(() => {
      this.checkK8sClusterAlerts().catch(error => console.warn('Kubernetes alert polling failed.', error));
    }, 60000);
    this.pollIntervals.set('__k8s_alert_monitor__', k8sInterval);

    console.log(`🚀 Service & K8s Cluster Alert Monitoring Started (max concurrency: ${this.maxConcurrentChecks})`);
  }

  public stop(closeRepository = true): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    this.pollIntervals.forEach(interval => clearInterval(interval));
    this.pollIntervals.clear();
    this.initialPollTimeouts.forEach(timeout => clearTimeout(timeout));
    this.initialPollTimeouts.clear();

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
    this.checkQueue.forEach(check => check.cancel());
    this.checkQueue = [];
    // In-flight checks still release their own slots in finally. Resetting the
    // counter here would make it negative and break the next start's bound.

    if (closeRepository && this.repository) {
      this.repository.close().catch(error_ => console.warn('Failed to close the service repository.', error_));
    }
    console.log('🛑 Service Monitoring Stopped');
  }

  public async closeRepository(): Promise<void> {
    await this.repository?.close();
  }

  private startPolling(serviceName: string): void {
    if (this.pollIntervals.has(serviceName)) return;

    const service = this.services.get(serviceName);

    // Per-service interval: service.interval is in ms (same unit as POLL_INTERVAL env var)
    // Falls back to global POLL_INTERVAL if not set per-service
    const effectiveInterval = service?.interval || this.pollInterval;

    const runCheck = () => {
      if (!this.isRunning || !this.services.has(serviceName)) return;
      this.checkServiceHealth(serviceName).catch(console.error);
    };

    // Jitter: randomize the initial check within [0, effectiveInterval]
    // Staggers checks across time to prevent thundering herd on startup
    const jitter = randomInt(effectiveInterval);
    this.initialPollTimeouts.set(serviceName, setTimeout(() => {
      this.initialPollTimeouts.delete(serviceName);
      runCheck();
    }, jitter));

    const interval = setInterval(runCheck, effectiveInterval);
    this.pollIntervals.set(serviceName, interval);
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
      const port = Number.parseInt(portStr);

      if (!host || Number.isNaN(port)) { resolve(false); return; }

      const socket = new net.Socket();
      socket.setTimeout(this.requestTimeout);
      socket.on('connect', () => { socket.destroy(); resolve(true); });
      socket.on('error', () => resolve(false));
      socket.on('timeout', () => { socket.destroy(); resolve(false); });
      socket.connect(port, host);
    });
  }

  private checkTlsRaw(urlStr: string): Promise<tls.PeerCertificate | null> {
    return new Promise((resolve) => {
      try {
        const u = new URL(urlStr);
        const port = u.port ? Number.parseInt(u.port, 10) : 443;
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

  private async checkIcmp(endpoint: string): Promise<boolean> {
    try {
      const host = endpointToIcmpHost(endpoint);
      if (!host) return false;
      const isWindows = process.platform === 'win32';
      // Keep the existing platform behavior but never construct shell syntax
      // from a configured monitor endpoint.
      const args = isWindows
        ? ['-n', '1', '-w', '2000', host]
        : ['-c', '1', '-W', '2', host];
      await execFileAsync('ping', args);
      return true;
    } catch {
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
      clearTimeout(this.initialPollTimeouts.get(name));
      this.initialPollTimeouts.delete(name);
      this.pollIntervals.delete(name);
      this.startPolling(name);
    }

    return updatedService;
  }

  public async deleteService(name: string): Promise<void> {
    await this.repository.deleteService(name);
    this.services.delete(name);
    clearTimeout(this.initialPollTimeouts.get(name));
    this.initialPollTimeouts.delete(name);
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
      const mergedHeaders = { ...service.headers, ...headers };
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
      averageUptime: Number.parseFloat((totalUptime / services.length).toFixed(2)),
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

  private readonly failingK8sPods: Map<string, { lastStatus: string; lastRestarts: number }> = new Map();
  private readonly monitoredPodStates: Map<string, { lastStatus: string; lastRestarts: number }> = new Map();
  private readonly reportedK8sAlerts: Set<string> = new Set();

  private notifyPodDegraded(namespace: string, pod: KubePod, restarts: number): void {
    const title = `Deployment degraded: ${namespace}/${pod.name}`;
    const message = `State: Pod ${pod.status} (Restarts: ${restarts})\nTarget: ${namespace}/${pod.name}\nNamespace: ${namespace}\nNode: ${pod.nodeName || 'N/A'}`;
    NotificationManager.getInstance().notifyCustomAlert(title, message, {
      'State': `Pod status is ${pod.status}`,
      'Target': `${namespace}/${pod.name}`,
      'Restarts': `${restarts}`,
      'Namespace': namespace,
      'Node': pod.nodeName || 'N/A',
    }).catch(reportNotificationFailure);
  }

  private processPodAlert(namespace: string, pod: KubePod): void {
    const key = `${namespace}/${pod.name}`;
    const status = String(pod.status || '').toLowerCase();
    const restarts = pod.restarts || 0;
    const state = { lastStatus: pod.status, lastRestarts: restarts };
    if (status.includes('completed') || status.includes('succeeded')) {
      this.failingK8sPods.delete(key);
      this.monitoredPodStates.set(key, state);
      return;
    }
    const isFailing = ['crashloop', 'error', 'oomkilled', 'imagepull', 'backoff', 'evicted', 'failed']
      .some(reason => status.includes(reason));
    const previous = this.monitoredPodStates.get(key);
    const isNewRestart = previous !== undefined && restarts > previous.lastRestarts;
    this.monitoredPodStates.set(key, state);
    if (isFailing || isNewRestart) {
      const active = this.failingK8sPods.get(key);
      if (active?.lastStatus === pod.status && active.lastRestarts === restarts) return;
      this.failingK8sPods.set(key, state);
      this.notifyPodDegraded(namespace, pod, restarts);
      return;
    }
    if (this.failingK8sPods.delete(key)) {
      NotificationManager.getInstance().notifyStatusChange(key, 'healthy', undefined, {
        'State': `Pod returned to healthy Running state (Restarts: ${restarts})`,
        'Namespace': namespace,
        'Node': pod.nodeName || 'N/A',
      }).catch(reportNotificationFailure);
    }
  }

  private processNodeAlert(node: { name: string; cpuPercent?: string; memoryPercent?: string }): void {
    const cpuUsed = Number.parseFloat(node.cpuPercent || '0');
    const memUsed = Number.parseFloat(node.memoryPercent || '0');
    if (!(cpuUsed > 85 || memUsed > 85)) return;
    const key = `node-${node.name}-${cpuUsed.toFixed(0)}-${memUsed.toFixed(0)}`;
    if (this.reportedK8sAlerts.has(key)) return;
    this.reportedK8sAlerts.add(key);
    const title = `K8s Node Resource Warning: ${node.name}`;
    const message = `State: High Resource Utilization\nNode CPU Usage: ${cpuUsed.toFixed(1)}%\nNode Memory Usage: ${memUsed.toFixed(1)}%\nThreshold: 85%`;
    NotificationManager.getInstance().notifyCustomAlert(title, message, {
      'State': `High Resource Utilization (CPU: ${cpuUsed.toFixed(1)}%, Mem: ${memUsed.toFixed(1)}%)`,
      'Target': node.name,
      'CPU Usage': `${cpuUsed.toFixed(1)}%`,
      'Memory Usage': `${memUsed.toFixed(1)}%`,
      'Threshold': '85%',
    }).catch(reportNotificationFailure);
  }

  public async checkK8sClusterAlerts(): Promise<void> {
    try {
      const cluster = KubernetesService.getInstance();
      if (!cluster.available) return;
      const context = cluster.defaultContext || cluster.getKubeConfig()?.getCurrentContext() || '';
      const namespaces = await cluster.getNamespaces(context);
      for (const namespace of namespaces) {
        const pods = await cluster.getPods(context, namespace);
        for (const pod of pods) this.processPodAlert(namespace, pod);
      }
      const nodes = await cluster.getNodes(context);
      for (const node of nodes) this.processNodeAlert(node);
    } catch (error_) {
      console.warn('Kubernetes background alert monitor failed; retrying on the next poll.', error_);
    }
  }
}
