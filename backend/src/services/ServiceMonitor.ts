import axios, { AxiosError } from 'axios';
import NodeCache from 'node-cache';
import { ServiceConfig, HealthCheck, ServiceStatus, SystemConfig } from '../types';
import type { ConnectionOptions } from 'mysql2';
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

  private constructor() {
    this.maxHistorySize = parseInt(process.env.MAX_HISTORY_SIZE || '6000', 10);
    this.pollInterval = parseInt(process.env.POLL_INTERVAL || '30000', 10);
    this.requestTimeout = parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000', 10);
    this.persistenceEnabled = process.env.ENABLE_PERSISTENCE === 'true';
    this.dataDir = process.env.DATA_DIR || './data';

    // Initialize cache with TTL
    this.cache = new NodeCache({
      stdTTL: 60, // 1 minute TTL for cached responses
      checkperiod: 120,
    });
    
    // Config loading moved to initialize()
  }

  public static getInstance(): ServiceMonitor {
    if (!ServiceMonitor.instance) {
      ServiceMonitor.instance = new ServiceMonitor();
    }
    return ServiceMonitor.instance;
  }

  /**
   * Initialize the monitor and database connection.
   * MUST be called before start().
   */
  public async initialize(): Promise<void> {
    try {
      this.repository = await DatabaseFactory.getServiceRepository();
      console.log('🔌 Database Repository Initialized');

      // Load initial state from repository
      const services = await this.repository.getAllServices();
      this.services.clear();
      services.forEach(s => this.services.set(s.name, s));
      
      console.log(`📋 Loaded ${this.services.size} services from repository`);
      
      // Load System Config
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

  // --- Core Monitoring Logic ---

  public async checkServiceHealth(serviceName: string): Promise<HealthCheck> {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service ${serviceName} not found`);
    }

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
        const httpsAgent = isHttps ? new https.Agent({ 
            rejectUnauthorized: !service.ignoreSSL, // Allow self-signed if ignoreSSL is true
            keepAlive: false // Disable keep-alive to ensure we get the certificate every time
        }) : undefined;

        const response = await axios.get(service.endpoint, {
            timeout: this.requestTimeout,
            maxRedirects: 0,
            validateStatus: () => true,
            headers: service.headers || {},
            httpsAgent: httpsAgent
        });

        // Capture SSL Expiry - Robust Strategy
        // If Axios request object has cert, use it.
        // If not (e.g. 302 Redirect + fast socket close), fallback to specialized TLS probe.
        if (isHttps) {
            let cert: any = response.request?.res?.socket?.getPeerCertificate?.();
            
            // Fallback if empty, but only if request itself was technically successful (got a response)
            // We use response.status to check success since 'success' var is defined later
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
      const responseTime = Date.now() - startTime;
      check = {
        status: 0,
        responseTime,
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

    // Update local state
    service.lastCheck = check;
    service.currentStatus = newStatus;
    service.history.push(check);
    if (service.history.length > this.maxHistorySize) {
        service.history.shift();
    }
    this.updateStats(service);
    
    // Trigger notification if status changed (and it's not the first check/unknown)
    if (oldStatus !== 'unknown' && oldStatus !== newStatus) {
       // Dynamic require to avoid circular dependency if Manager imports Monitor
       const NotificationManager = require('../services/NotificationManager').NotificationManager;
       NotificationManager.getInstance().notifyStatusChange(
          serviceName, 
          newStatus, 
          check.success ? undefined : (check.error || `Status Code: ${check.status}`)
       );
    }
    
    // Persist check result via Repository
    try {
        await this.repository.saveCheckResult(serviceName, check, { sslExpiry: service.sslExpiry });
    } catch (err) {
        console.error(`Failed to persist check result for ${serviceName}`, err);
    }
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    
    // Start polling all services
    this.services.forEach(service => this.startPolling(service.name));
    console.log('🚀 Service Monitoring Started');
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    
    this.pollIntervals.forEach(interval => clearInterval(interval));
    this.pollIntervals.clear();
    
    if (this.repository) {
        this.repository.close();
    }
    console.log('🛑 Service Monitoring Stopped');
  }

  private startPolling(serviceName: string): void {
    if (this.pollIntervals.has(serviceName)) return;

    // Initial check
    this.checkServiceHealth(serviceName).catch(console.error);

    const interval = setInterval(() => {
      this.checkServiceHealth(serviceName).catch(console.error);
    }, this.pollInterval);

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
         // Endpoint should be host:port
         const [host, portStr] = endpoint.split(':');
         const port = parseInt(portStr);
         
         if (!host || isNaN(port)) {
             resolve(false); // Invalid config
             return;
         }

         const socket = new net.Socket();
         socket.setTimeout(this.requestTimeout);
         
         socket.on('connect', () => {
             socket.destroy();
             resolve(true);
         });
         
         socket.on('error', () => resolve(false));
         socket.on('timeout', () => {
             socket.destroy();
             resolve(false);
         });
         
         socket.connect(port, host);
     });
  }

  private checkTlsRaw(urlStr: string): Promise<any> {
    return new Promise((resolve, reject) => {
        try {
            const u = new URL(urlStr);
            const port = u.port ? parseInt(u.port, 10) : 443;
            const options = {
                host: u.hostname,
                port: port,
                servername: u.hostname, // SNI Support
                rejectUnauthorized: false // We just want the cert, don't fail on validation here (Axios handles that validation)
            };

            const socket = tls.connect(options, () => {
                const cert = socket.getPeerCertificate();
                socket.end();
                resolve(cert);
            });

            socket.on('error', (err) => {
                // If handshake fails, we might not get cert, but resolve empty to avoid crash
                // Unless it's a timeout
                resolve(null); 
            });
            
            socket.setTimeout(this.requestTimeout, () => {
                socket.destroy();
                resolve(null);
            });
        } catch (e) {
            resolve(null);
        }
    });
  }

  private async checkMysql(connectionString: string): Promise<boolean> {
      let connection;
      try {
          connection = await mysql.createConnection(connectionString);
          await connection.ping(); // Simple ping
          return true;
      } catch (err) {
          return false;
      } finally {
          if (connection) await connection.end();
      }
  }

  private async checkMongo(connectionString: string): Promise<boolean> {
      // Create a separate connection just for this check, don't use global mongoose connection
      try {
          // Use mongoose.createConnection to avoid messing with global state
          const conn = await mongoose.createConnection(connectionString, {
              serverSelectionTimeoutMS: this.requestTimeout,
              connectTimeoutMS: this.requestTimeout
          }).asPromise();
          
          await conn.close();
          return true;
      } catch (err) {
          return false;
      }
  }

  public async addService(config: ServiceConfig): Promise<ServiceStatus> {
     // Persist via Repo first
     const newService = await this.repository.addService(config);
     
     // Update in-memory map
     this.services.set(newService.name, newService);
     
     // Start monitoring
     if (this.isRunning) {
         this.startPolling(newService.name);
     }
     
     return newService;
  }

  public async updateService(name: string, config: Partial<ServiceConfig>): Promise<ServiceStatus> {
      // Persist via Repo
      const updatedService = await this.repository.updateService(name, config);
      
      // Update in-memory: Repo 'updateService' might not return the FULL object with history
      // if it just updates DB. But interface says Returns ServiceStatus.
      // We should be careful to merge history if the repo doesn't return it.
      // My implementation of JsonServiceRepository returns the modified object from map (so has history).
      // My implementation of MysqlServiceRepository returns object, but history might be empty?
      // Let's check MysqlServiceRepository::updateService.
      // It returns `service` from map.
      // So history is preserved in memory map in Repo.
      // Wait, MysqlServiceRepository caches map? 
      // Yes, I implemented a Map cache in MysqlServiceRepository as well.
      // So `this.services.set(name, updatedService)` replaces the memory object.
      // Does Repo map have history? In `loadInitialState` I loaded 50.
      // In `updateService`, I modify endpoint. History remains.
      // So it is safe.
      
      // However, ServiceMonitor ALSO has a map `this.services`.
      // We are updating `this.services` with result from repo.
      // If repo result is fresh without history (e.g. if I fetched from DB), we lose history.
      // But implementation uses a local map in repo.
      
      // Ideally, ServiceMonitor shouldn't maintain a separate map if Repo does.
      // But ServiceMonitor needs it for polling loop.
      // And ServiceMonitor IS the source of truth for runtime state (timers, etc).
      // The Repository is for PERSISTENCE.
      // It's a bit duplicate.
      // But fine for now.
      
      this.updateStats(updatedService);
      this.services.set(name, updatedService);
      
      // Restart polling if endpoint changed?
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
  
  // Custom Endpoint Check
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
      const response = await axios({
        url: fullUrl,
        method,
        headers: mergedHeaders,
        data: body,
        timeout: this.requestTimeout,
        maxRedirects: 0,
        validateStatus: () => true,
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
    averageResponseTime: number 
  } {
    const services = Array.from(this.services.values());
    if (services.length === 0) {
      return { 
        totalServices: 0, 
        healthyServices: 0, 
        unhealthyServices: 0, 
        unknownServices: 0, 
        averageUptime: 0, 
        averageResponseTime: 0 
      };
    }

    const totalUptime = services.reduce((sum, s) => sum + (s.uptime || 0), 0);
    const totalResponseTime = services.reduce((sum, s) => sum + (s.averageResponseTime || 0), 0);
    
    const healthyServices = services.filter(s => s.currentStatus === 'healthy').length;
    const unhealthyServices = services.filter(s => s.currentStatus === 'unhealthy').length;
    // Catch-all for unknown, matching frontend fallback logic
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
