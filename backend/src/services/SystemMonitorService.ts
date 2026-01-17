
import si from 'systeminformation';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { SystemMetrics, DiskInfo } from '../types';
import * as ss from 'simple-statistics';

export class SystemMonitorService {
  private static instance: SystemMonitorService;

  private constructor() {}

  public static getInstance(): SystemMonitorService {
    if (!SystemMonitorService.instance) {
      SystemMonitorService.instance = new SystemMonitorService();
    }
    return SystemMonitorService.instance;
  }

  // Live Data for Dashboard Widget
  public async getLiveStats(): Promise<SystemMetrics> {
    const cpuPromise = si.currentLoad();
    const memPromise = si.mem();
    const diskPromise = si.fsSize();

    const [cpu, mem, disks] = await Promise.all([cpuPromise, memPromise, diskPromise]);

    const repo = await DatabaseFactory.getSystemRepository();
    const config = await repo.getStorageConfig();
    const allowedMounts = config.allowedMounts || [];

    // Filter restricted disks if config exists (if empty config, might default to ALL or NONE? 
    // Let's default to ALL if nothing configured, or explicitly require config. 
    // User asked to select checkboxes. Better default: Show typical physical disks.)
    
    // Process disks
    const formattedDisks: DiskInfo[] = disks.map(d => ({
        fs: d.fs,
        type: d.type,
        size: d.size,
        used: d.used,
        available: d.available,
        use: d.use,
        mount: d.mount
    }));

    return {
      cpuLoad: cpu.currentLoad,
      memory: {
        total: mem.total,
        active: mem.active,
        used: mem.used
      },
      uptime: si.time().uptime,
      disks: formattedDisks,
      timestamp: Date.now()
    };
  }

  // Scheduled Job: Save Historical Data
  public async snapshot(): Promise<void> {
    const stats = await this.getLiveStats();
    
    // Filter disks to ONLY save configured ones
    const repo = await DatabaseFactory.getSystemRepository();
    const config = await repo.getStorageConfig();
    
    if (config.allowedMounts && config.allowedMounts.length > 0) {
        stats.disks = stats.disks.filter(d => config.allowedMounts.includes(d.mount));
    } else {
        // If NO disks configured, maybe save none to save space? Or save root?
        const root = stats.disks.find(d => d.mount === '/');
        if (root) stats.disks = [root];
        else stats.disks = []; 
    }

    if (stats.disks.length > 0) {
        await repo.saveMetrics(stats);
    }
  }

  // Configuration
  public async getAllDisks(): Promise<DiskInfo[]> {
    const disks = await si.fsSize();
    return disks.map(d => ({
        fs: d.fs,
        type: d.type,
        size: d.size,
        used: d.used,
        available: d.available,
        use: d.use,
        mount: d.mount
    }));
  }

  public async updateMonitoredDisks(mounts: string[]): Promise<void> {
    const repo = await DatabaseFactory.getSystemRepository();
    await repo.updateStorageConfig({ allowedMounts: mounts });
  }

  public async getMonitoredDisksConfig(): Promise<string[]> {
    const repo = await DatabaseFactory.getSystemRepository();
    const config = await repo.getStorageConfig();
    return config.allowedMounts || [];
  }

  // Analytics: Time-to-Death
  public async getStoragePrediction(): Promise<any> {
    const repo = await DatabaseFactory.getSystemRepository();
    const history = await repo.getMetricsHistory(24 * 30); // 30 Days history
    
    if (history.length < 24) { // Need at least 1 day of data for decent prediction
        return { readable: false, reason: 'Insufficient data (need ~24h)' };
    }

    const predictions: any[] = [];
    const config = await repo.getStorageConfig();
    const allowedMounts = config.allowedMounts || [];

    // Group history by disk mount
    // Map<mount, Array<{x: time, y: used}>>
    const diskHistory = new Map<string, number[][]>();
    
    // Initialize for configured mounts
    allowedMounts.forEach(m => diskHistory.set(m, []));

    history.forEach(point => {
        point.disks.forEach(d => {
            if (diskHistory.has(d.mount)) {
                diskHistory.get(d.mount)?.push([point.timestamp || 0, d.used]);
            }
        });
    });

    // Calculate Regression for each disk
    diskHistory.forEach((points, mount) => {
        if (points.length < 10) return;

        // Simple Linear Regression: y = mx + b
        // x = timestamp, y = bytes used
        const regression = ss.linearRegression(points);
        const line = ss.linearRegressionLine(regression);
        
        // Slope (m) = bytes per millisecond
        // If m <= 0, disk is cleaning up or static. No death date.
        
        const currentUsage = points[points.length - 1][1]; 
        // Find total size for this mount from latest point
        const latestPoint = history[history.length - 1].disks.find(d => d.mount === mount);
        const totalSize = latestPoint?.size || 0;
        
        if (regression.m > 0) {
            const bytesPerDay = regression.m * 86400000;
            const remainingBytes = totalSize - currentUsage;
            const daysRemaining = remainingBytes / bytesPerDay;
            
            predictions.push({
                mount,
                daysRemaining: Math.floor(daysRemaining),
                trend: 'growing',
                bytesPerDay,
                isCritical: daysRemaining < 14 // Alert if < 2 weeks
            });
        }
    });

    return predictions;
  }
}
