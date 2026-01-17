
import fs from 'fs';
import path from 'path';
import { ISystemRepository } from '../../interfaces/ISystemRepository';
import { SystemMetrics } from '../../../types';

export class JsonSystemRepository implements ISystemRepository {
  private dataDir: string;
  private metricsPath: string;
  private configPath: string;

  constructor() {
    this.dataDir = process.env.DATA_DIR || './data';
    this.metricsPath = path.join(this.dataDir, 'system-metrics.json');
    this.configPath = path.join(this.dataDir, 'system-config.json');
  }

  async initialize(): Promise<void> {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  async saveMetrics(metrics: SystemMetrics): Promise<void> {
    const history = await this.getMetricsHistory(1000); // Read existing
    history.unshift(metrics); // Prepend new
    
    // Limit to 24*7 points (assuming 1 per hour, but this is live data so maybe more?)
    // Let's keep last 2000 points (~1.5 days at 1 min interval) to avoid huge JSON files
    const trimmed = history.slice(0, 2000);
    
    fs.writeFileSync(this.metricsPath, JSON.stringify(trimmed, null, 2));
  }

  async getMetricsHistory(limit?: number): Promise<SystemMetrics[]> {
    if (!fs.existsSync(this.metricsPath)) return [];
    try {
        const data = JSON.parse(fs.readFileSync(this.metricsPath, 'utf-8'));
        return limit ? data.slice(0, limit) : data;
    } catch (e) {
        console.error('Failed to read system metrics:', e);
        return [];
    }
  }

  async getStorageConfig(): Promise<{ allowedMounts: string[] }> {
    if (!fs.existsSync(this.configPath)) return { allowedMounts: [] };
    try {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
    } catch (e) {
        return { allowedMounts: [] };
    }
  }

  async updateStorageConfig(config: { allowedMounts: string[] }): Promise<void> {
    if (!fs.existsSync(this.dataDir)) await this.initialize();
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }
}
