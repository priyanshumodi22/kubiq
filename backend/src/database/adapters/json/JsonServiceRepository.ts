import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { IServiceRepository } from '../../interfaces/IServiceRepository';
import { ServiceStatus, ServiceConfig, HealthCheck, SystemConfig } from '../../../types';

export class JsonServiceRepository implements IServiceRepository {
  private dataDir: string;
  private servicesConfigPath: string;
  private services: Map<string, ServiceStatus> = new Map();

  async getSystemConfig(): Promise<SystemConfig> {
    const defaultConfig: SystemConfig = {
      slug: null,
      dashboardTitle: 'System Status',
      refreshInterval: 300,
    };

    try {
      const configFile = path.join(this.dataDir, 'status-page-config.json');
      if (fs.existsSync(configFile)) {
        const fileContent = fs.readFileSync(configFile, 'utf-8');
        const config = JSON.parse(fileContent);
        return { ...defaultConfig, ...config };
      }
    } catch (error) {
      console.error('❌ Error loading status config:', error);
    }
    return defaultConfig;
  }

  async saveSystemConfig(config: SystemConfig): Promise<void> {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      const configFile = path.join(this.dataDir, 'status-page-config.json');
      fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('❌ Error saving status config:', error);
    }
  }

  constructor() {
    this.dataDir = process.env.DATA_DIR || './data';
    this.servicesConfigPath = process.env.SERVICES_CONFIG_PATH || '/etc/kubiq/services/services.ini';
  }

  async initialize(): Promise<void> {
    this.loadServicesFromConfig();
    this.loadPersistedHistory();
  }

  async getAllServices(): Promise<ServiceStatus[]> {
    return Array.from(this.services.values());
  }

  async getServiceByName(name: string): Promise<ServiceStatus | null> {
    return this.services.get(name) || null;
  }

  async addService(config: ServiceConfig): Promise<ServiceStatus> {
    if (this.services.has(config.name)) {
      throw new Error(`Service ${config.name} already exists`);
    }

    const newService: ServiceStatus = {
      name: config.name,
      endpoint: config.endpoint,
      type: config.type || 'http',
      headers: config.headers,
      ignoreSSL: config.ignoreSSL,
      logPath: config.logPath,
      logSources: config.logSources, // New
      currentStatus: 'unknown',
      history: []
    };

    this.services.set(config.name, newService);
    this.saveServicesConfig();
    return newService;
  }

  async updateService(name: string, config: Partial<ServiceConfig>): Promise<ServiceStatus> {
    const service = this.services.get(name);
    if (!service) throw new Error(`Service ${name} not found`);

    if (config.endpoint) service.endpoint = config.endpoint;
    if (config.headers) service.headers = config.headers;
    if (config.type) service.type = config.type;
    if (config.ignoreSSL !== undefined) service.ignoreSSL = config.ignoreSSL;
    if (config.logPath !== undefined) service.logPath = config.logPath;
    if (config.logSources !== undefined) service.logSources = config.logSources;
    
    // Note: We deliberately do NOT reset status/history here to preserve state (as fixed previously)
    
    this.services.set(name, service);
    this.saveServicesConfig();
    return service;
  }

  async deleteService(name: string): Promise<void> {
    if (!this.services.has(name)) throw new Error(`Service ${name} not found`);
    this.services.delete(name);
    this.saveServicesConfig();
    this.saveHistory(); // Clean up history file too
  }

  async saveCheckResult(serviceName: string, result: HealthCheck, extraData?: { sslExpiry?: Date | null }): Promise<void> {
    const service = this.services.get(serviceName);
    if (!service) return;

    service.lastCheck = result;
    service.currentStatus = result.success ? 'healthy' : 'unhealthy';
    if (extraData && extraData.sslExpiry !== undefined) {
        service.sslExpiry = extraData.sslExpiry;
    }
    
    // Add to history
    service.history.push(result);
    const maxHistory = parseInt(process.env.MAX_HISTORY_SIZE || '100', 10);
    if (service.history.length > maxHistory) {
      service.history.shift();
    }

    // Update stats
    this.updateStats(service);
    
    // Persist to disk (maybe debounce this in prod, but simple here)
    this.saveHistory(); 
  }

  async getServiceHistory(serviceName: string, limit: number = 20): Promise<HealthCheck[]> {
    const service = this.services.get(serviceName);
    if (!service) return [];
    return service.history.slice(-limit);
  }

  async close(): Promise<void> {
    // No connection to close for JSON
  }

  // --- Private Helpers (Ported from ServiceMonitor.ts) ---

  private loadServicesFromConfig(): void {
    if (!fs.existsSync(this.servicesConfigPath)) return;
    try {
      const content = fs.readFileSync(this.servicesConfigPath, 'utf-8');
      const lines = content.split('\n');
      lines.forEach(line => {
        const namePart = line.indexOf('=');
        if (namePart === -1) return;
        const name = line.substring(0, namePart).trim();
        const val = line.substring(namePart + 1).trim();
        
        if (name && val && !name.startsWith('#')) {
             // Basic parse (simplified for brevity, assumes standard format)
             const parts = val.split('|');
             this.services.set(name, {
                 id: crypto.createHash('md5').update(name).digest('hex'), // Generate stable ID
                 name, 
                 endpoint: parts[0],
                 // parts[1] is headers (JSON string) usually, let's assume standard format is: endpoint|headers|type
                  headers: parts[1] && parts[1] !== 'undefined' ? JSON.parse(parts[1]) : undefined,
                  type: (parts[2] as any) || 'http',
                  ignoreSSL: parts[3] === 'true', // ignoreSSL
                  // logPath: parts[4], // Deprecated
                  logSources: parts[5] && parts[5] !== 'undefined' 
                        ? JSON.parse(Buffer.from(parts[5], 'base64').toString('utf-8')) 
                        : undefined, // logSources (Base64 encoded)
                  currentStatus: 'unknown',
                  history: []
             });
        }
      });
    } catch (e) { console.error('Error loading config', e); }
  }

  private loadPersistedHistory(): void {
    const file = path.join(this.dataDir, 'kubiq-history.json');
    if (!fs.existsSync(file)) return;
    try {
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        data.forEach(([name, status]: any) => {
            if (this.services.has(name)) {
                const s = this.services.get(name)!;
                s.history = status.history || [];
                s.currentStatus = status.currentStatus;
                this.services.set(name, s);
            }
        });
    } catch (e) { console.error('Error loading history', e); }
  }

  private saveServicesConfig(): void {
     const lines = ['# Kubiq Services'];
     this.services.forEach(s => {
         let headers = s.headers ? JSON.stringify(s.headers) : 'undefined';
         let type = s.type || 'http';
         let ignoreSSL = s.ignoreSSL || false;
         let logPath = 'undefined'; // Deprecated, always write undefined
         // Use Base64 for logSources to avoid delimiter collision with pipe '|'
         let logSources = s.logSources ? Buffer.from(JSON.stringify(s.logSources)).toString('base64') : 'undefined';
         // Format: name=endpoint|headers|type|ignoreSSL|logPath|logSources
         let line = `${s.name}=${s.endpoint}|${headers}|${type}|${ignoreSSL}|${logPath}|${logSources}`;
         lines.push(line);
     });
     try {
        const dir = path.dirname(this.servicesConfigPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this.servicesConfigPath, lines.join('\n'));
     } catch (e) {
         console.error('Failed to save config', e);
     }
  }

  private saveHistory(): void {
      const file = path.join(this.dataDir, 'kubiq-history.json');
      const data = Array.from(this.services.entries());
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  private updateStats(service: ServiceStatus): void {
      // Recalc average response time and uptime
      const recent = service.history.slice(-20);
      const valid = recent.filter(c => c.success);
      if (valid.length) {
          service.averageResponseTime = valid.reduce((sum, c) => sum + c.responseTime, 0) / valid.length;
      }
      const successCount = service.history.filter(c => c.success).length;
      service.uptime = service.history.length ? (successCount / service.history.length) * 100 : 100;
  }
}
