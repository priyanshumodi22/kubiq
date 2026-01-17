import { ServiceStatus, ServiceConfig, HealthCheck, SystemConfig } from '../../types';

export interface IServiceRepository {
  initialize(): Promise<void>;
  getAllServices(): Promise<ServiceStatus[]>;
  getServiceByName(name: string): Promise<ServiceStatus | null>;
  addService(service: ServiceConfig): Promise<ServiceStatus>;
  updateService(name: string, service: Partial<ServiceConfig>): Promise<ServiceStatus>;
  deleteService(name: string): Promise<void>;
  saveCheckResult(serviceName: string, result: HealthCheck, extraData?: { sslExpiry?: Date | null }): Promise<void>;
  getServiceHistory(serviceName: string, limit?: number): Promise<HealthCheck[]>;
  getSystemConfig(): Promise<SystemConfig>;
  saveSystemConfig(config: SystemConfig): Promise<void>;
  close(): Promise<void>;
}
