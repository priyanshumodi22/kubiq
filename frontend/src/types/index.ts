export interface ServiceConfig {
  name: string;
  endpoint: string;
  type?: 'http' | 'tcp' | 'icmp' | 'mysql' | 'mongodb';
  enabled?: boolean;
}

export interface HealthCheck {
  status: number;
  responseTime: number;
  timestamp: number;
  success: boolean;
  error?: string;
  data?: any;
}

export interface ServiceStatus {
  name: string;
  endpoint: string;
  type?: 'http' | 'tcp' | 'icmp' | 'mysql' | 'mongodb';
  headers?: Record<string, string>;
  currentStatus: 'healthy' | 'unhealthy' | 'unknown';
  lastCheck?: HealthCheck;
  history: HealthCheck[];
  uptime?: number;
  averageResponseTime?: number;
  ignoreSSL?: boolean; // New
  sslExpiry?: string | null; // Date comes as string from JSON API
}

export interface Stats {
  totalServices: number;
  healthyServices: number;
  unhealthyServices: number;
  unknownServices: number;
  isRunning: boolean;
}

export interface DiskInfo {
  fs: string;
  type: string;
  size: number;
  used: number;
  available: number;
  use: number;
  mount: string;
}

export interface SystemMetrics {
  cpuLoad: number;
  memory: {
    total: number;
    active: number;
    used: number;
  };
  uptime: number;
  disks: DiskInfo[];
  timestamp?: number;
}

export interface StoragePrediction {
    mount: string;
    daysRemaining: number;
    trend: 'growing' | 'shrinking' | 'stable';
    bytesPerDay: number;
    isCritical: boolean;
}
