import axios, { AxiosError } from 'axios';
import NodeCache from 'node-cache';
import fs from 'fs';
import path from 'path';
import { ServiceConfig, HealthCheck, ServiceStatus } from '../types';

export class ServiceMonitor {
  private static instance: ServiceMonitor;
  private services: Map<string, ServiceStatus> = new Map();
  private cache: NodeCache;
  private pollIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;
  private readonly maxHistorySize: number;
  private readonly pollInterval: number;
  private readonly requestTimeout: number;
  private readonly persistenceEnabled: boolean;
  private readonly dataDir: string;
  private persistenceInterval?: NodeJS.Timeout;

  private constructor() {
    this.maxHistorySize = parseInt(process.env.MAX_HISTORY_SIZE || '100', 10);
    this.pollInterval = parseInt(process.env.POLL_INTERVAL || '30000', 10);
    this.requestTimeout = parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000', 10);
    this.persistenceEnabled = process.env.ENABLE_PERSISTENCE === 'true';
    this.dataDir = process.env.DATA_DIR || './data';

    // Initialize cache with TTL
    this.cache = new NodeCache({
      stdTTL: 60, // 1 minute TTL for cached responses
      checkperiod: 120,
    });

    this.loadServicesFromConfig();
    this.loadPersistedData();
  }

  public static getInstance(): ServiceMonitor {
    if (!ServiceMonitor.instance) {
      ServiceMonitor.instance = new ServiceMonitor();
    }
    return ServiceMonitor.instance;
  }

  private loadServicesFromConfig(): void {
    const configPath = process.env.SERVICES_CONFIG_PATH || '/etc/kubiq/services';

    try {
      // Auto-create config file if it doesn't exist
      if (!fs.existsSync(configPath)) {
        const configDir = path.dirname(configPath);
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
        }

        // Create empty config file with comments
        const initialContent = `# Kubiq Services Configuration
# Format: service-name=endpoint-url
# Example: backend-api=http://localhost:3001/health
`;
        fs.writeFileSync(configPath, initialContent, 'utf-8');
        console.log(`📝 Created new services config at ${configPath}`);
      }

      const configData = fs.readFileSync(configPath, 'utf-8');
      const lines = configData.split('\n').filter((line) => line.trim() && !line.startsWith('#'));

      lines.forEach((line) => {
        const [name, endpoint] = line.split('=').map((s) => s.trim());
        if (name && endpoint) {
          this.services.set(name, {
            name,
            endpoint,
            currentStatus: 'unknown',
            history: [],
          });
        }
      });

      console.log(`📋 Loaded ${this.services.size} services from config`);

      if (this.services.size === 0) {
        console.log('⚠️  No services configured, add services via API');
      }
    } catch (error) {
      console.error('❌ Error loading services config:', error);
    }
  }

  private loadDefaultServices(): void {
    // Fallback default services for local development
    const defaults: ServiceConfig[] = [
      { name: 'example-service', endpoint: 'http://localhost:8080/health' },
    ];

    defaults.forEach((config) => {
      this.services.set(config.name, {
        name: config.name,
        endpoint: config.endpoint,
        currentStatus: 'unknown',
        history: [],
      });
    });
  }

  private loadPersistedData(): void {
    if (!this.persistenceEnabled) return;

    try {
      const dataFile = path.join(this.dataDir, 'kubiq-history.json');
      if (fs.existsSync(dataFile)) {
        const fileContent = fs.readFileSync(dataFile, 'utf-8').trim();

        // Skip if file is empty
        if (!fileContent) {
          console.log('📁 Persisted data file is empty, starting fresh');
          return;
        }

        const data = JSON.parse(fileContent);
        data.forEach(([name, status]: [string, ServiceStatus]) => {
          if (this.services.has(name)) {
            const existing = this.services.get(name)!;
            existing.history = status.history || [];
            existing.lastCheck = status.lastCheck;
            existing.currentStatus = status.currentStatus;
            this.services.set(name, existing);
          }
        });
        console.log('💾 Loaded persisted data');
      }
    } catch (error) {
      console.error('❌ Error loading persisted data:', error);
      console.log('📁 Starting with fresh data');
    }
  }

  private persistData(): void {
    if (!this.persistenceEnabled) return;

    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }

      const dataFile = path.join(this.dataDir, 'kubiq-history.json');
      const data = Array.from(this.services.entries());
      fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('❌ Error persisting data:', error);
    }
  }

  public async checkServiceHealth(serviceName: string): Promise<HealthCheck> {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service ${serviceName} not found`);
    }

    const startTime = Date.now();

    try {
      const response = await axios.get(service.endpoint, {
        timeout: this.requestTimeout,
        validateStatus: () => true, // Accept any status code
      });

      const responseTime = Date.now() - startTime;
      const healthCheck: HealthCheck = {
        status: response.status,
        responseTime,
        timestamp: Date.now(),
        success: response.status >= 200 && response.status < 400, // Accept 2xx and 3xx (redirects)
        data: response.data,
      };

      this.addHealthCheck(serviceName, healthCheck);
      return healthCheck;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const healthCheck: HealthCheck = {
        status: 0,
        responseTime,
        timestamp: Date.now(),
        success: false,
        error: error instanceof AxiosError ? error.message : 'Unknown error',
      };

      this.addHealthCheck(serviceName, healthCheck);
      return healthCheck;
    }
  }

  private addHealthCheck(serviceName: string, check: HealthCheck): void {
    const service = this.services.get(serviceName);
    if (!service) return;

    // Add to history with circular buffer (keep only maxHistorySize)
    service.history.push(check);
    if (service.history.length > this.maxHistorySize) {
      service.history.shift();
    }

    // Update current status
    service.lastCheck = check;
    service.currentStatus = check.success ? 'healthy' : 'unhealthy';

    // Calculate average response time
    const recentChecks = service.history.slice(-20); // Last 20 checks
    const validChecks = recentChecks.filter((c) => c.success);
    if (validChecks.length > 0) {
      service.averageResponseTime =
        validChecks.reduce((sum, c) => sum + c.responseTime, 0) / validChecks.length;
    }

    // Calculate uptime percentage
    const successCount = service.history.filter((c) => c.success).length;
    service.uptime = (successCount / service.history.length) * 100;

    this.services.set(serviceName, service);

    // Invalidate cache for this service
    this.cache.del(`service:${serviceName}`);
    this.cache.del('services:all');
  }

  private async pollService(serviceName: string): Promise<void> {
    try {
      await this.checkServiceHealth(serviceName);
    } catch (error) {
      console.error(`Error polling ${serviceName}:`, error);
    }
  }

  public start(): void {
    if (this.isRunning) {
      console.warn('⚠️  ServiceMonitor is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting ServiceMonitor...');

    // Start polling for each service (staggered to avoid thundering herd)
    let delay = 0;
    this.services.forEach((service, name) => {
      setTimeout(() => {
        // Initial check
        this.pollService(name);

        // Set up interval for continuous polling
        const interval = setInterval(() => {
          this.pollService(name);
        }, this.pollInterval);

        this.pollIntervals.set(name, interval);
      }, delay);

      // Stagger by 1 second to distribute load
      delay += 1000;
    });

    // Set up persistence interval
    if (this.persistenceEnabled) {
      const snapshotInterval = parseInt(process.env.SNAPSHOT_INTERVAL || '300000', 10);
      this.persistenceInterval = setInterval(() => {
        this.persistData();
      }, snapshotInterval);
    }

    console.log(`✅ Monitoring ${this.services.size} services`);
  }

  public stop(): void {
    if (!this.isRunning) return;

    console.log('🛑 Stopping ServiceMonitor...');
    this.isRunning = false;

    // Clear all polling intervals
    this.pollIntervals.forEach((interval) => clearInterval(interval));
    this.pollIntervals.clear();

    // Clear persistence interval
    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
    }

    // Final data persistence
    if (this.persistenceEnabled) {
      this.persistData();
    }

    console.log('✅ ServiceMonitor stopped');
  }

  public getAllServices(): ServiceStatus[] {
    // Check cache first
    const cached = this.cache.get<ServiceStatus[]>('services:all');
    if (cached) {
      return cached;
    }

    const services = Array.from(this.services.values());
    this.cache.set('services:all', services, 5); // Cache for 5 seconds
    return services;
  }

  public getService(name: string): ServiceStatus | undefined {
    // Check cache first
    const cacheKey = `service:${name}`;
    const cached = this.cache.get<ServiceStatus>(cacheKey);
    if (cached) {
      return cached;
    }

    const service = this.services.get(name);
    if (service) {
      this.cache.set(cacheKey, service, 5); // Cache for 5 seconds
    }
    return service;
  }

  public getServiceHistory(name: string, limit?: number): HealthCheck[] {
    const service = this.services.get(name);
    if (!service) return [];

    const history = service.history;
    return limit ? history.slice(-limit) : history;
  }

  public async customEndpointCheck(serviceName: string, endpoint: string): Promise<any> {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service ${serviceName} not found`);
    }

    // Append custom endpoint to the service's base endpoint
    // Remove trailing slash from base endpoint and leading slash from custom endpoint if needed
    const baseEndpoint = service.endpoint.replace(/\/$/, '');
    const customPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const fullUrl = `${baseEndpoint}${customPath}`;

    const startTime = Date.now();

    try {
      const response = await axios.get(fullUrl, {
        timeout: this.requestTimeout,
        validateStatus: () => true,
      });

      return {
        status: 'success',
        data: response.data,
        responseTime: Date.now() - startTime,
        statusCode: response.status,
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof AxiosError ? error.message : 'Unknown error',
        responseTime: Date.now() - startTime,
      };
    }
  }

  public getStats() {
    const services = this.getAllServices();
    return {
      totalServices: services.length,
      healthyServices: services.filter((s) => s.currentStatus === 'healthy').length,
      unhealthyServices: services.filter((s) => s.currentStatus === 'unhealthy').length,
      unknownServices: services.filter((s) => s.currentStatus === 'unknown').length,
      isRunning: this.isRunning,
      pollInterval: this.pollInterval,
      maxHistorySize: this.maxHistorySize,
      persistenceEnabled: this.persistenceEnabled,
    };
  }

  private saveServicesConfig(): void {
    const configPath = process.env.SERVICES_CONFIG_PATH || '/etc/kubiq/services';

    try {
      const configDir = path.dirname(configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // Build config content
      let content = `# Kubiq Services Configuration\n`;
      content += `# Format: service-name=endpoint-url\n`;
      content += `# Last updated: ${new Date().toISOString()}\n\n`;

      this.services.forEach((service) => {
        content += `${service.name}=${service.endpoint}\n`;
      });

      // Atomic write: write to temp file then rename
      const tempPath = `${configPath}.tmp`;
      fs.writeFileSync(tempPath, content, 'utf-8');
      fs.renameSync(tempPath, configPath);

      console.log(`💾 Saved ${this.services.size} services to config`);
    } catch (error) {
      console.error('❌ Error saving services config:', error);
      throw new Error('Failed to save services configuration');
    }
  }

  public addService(name: string, endpoint: string): ServiceStatus {
    if (this.services.has(name)) {
      throw new Error(`Service ${name} already exists`);
    }

    // Validate endpoint URL
    try {
      new URL(endpoint);
    } catch {
      throw new Error('Invalid endpoint URL');
    }

    const newService: ServiceStatus = {
      name,
      endpoint,
      currentStatus: 'unknown',
      history: [],
    };

    this.services.set(name, newService);
    this.saveServicesConfig();

    // Start monitoring this service
    if (this.isRunning) {
      this.pollService(name);
    }

    // Invalidate cache
    this.cache.del('services:all');

    console.log(`➕ Added service: ${name}`);
    return newService;
  }

  public updateService(name: string, endpoint: string): ServiceStatus {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} not found`);
    }

    // Validate endpoint URL
    try {
      new URL(endpoint);
    } catch {
      throw new Error('Invalid endpoint URL');
    }

    service.endpoint = endpoint;
    // Reset status since endpoint changed
    service.currentStatus = 'unknown';
    service.history = [];

    this.services.set(name, service);
    this.saveServicesConfig();

    // Restart monitoring for this service
    if (this.isRunning) {
      this.pollService(name);
    }

    // Invalidate cache
    this.cache.del(`service:${name}`);
    this.cache.del('services:all');

    console.log(`✏️  Updated service: ${name}`);
    return service;
  }

  public deleteService(name: string): void {
    if (!this.services.has(name)) {
      throw new Error(`Service ${name} not found`);
    }

    // Stop polling for this service
    const interval = this.pollIntervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.pollIntervals.delete(name);
    }

    this.services.delete(name);
    this.saveServicesConfig();

    // Invalidate cache
    this.cache.del(`service:${name}`);
    this.cache.del('services:all');

    console.log(`🗑️  Deleted service: ${name}`);
  }
}
