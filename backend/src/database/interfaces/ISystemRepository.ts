
import { SystemMetrics } from '../../types';

export interface ISystemRepository {
  initialize(): Promise<void>;
  saveMetrics(metrics: SystemMetrics): Promise<void>;
  getMetricsHistory(limit?: number): Promise<SystemMetrics[]>;
  getStorageConfig(): Promise<{ allowedMounts: string[] }>;
  updateStorageConfig(config: { allowedMounts: string[] }): Promise<void>;
  getApmConfig(): Promise<{ ignoredRoutes: string[] }>;
  updateApmConfig(config: { ignoredRoutes: string[] }): Promise<void>;
}
