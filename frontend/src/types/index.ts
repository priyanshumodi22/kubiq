export interface ServiceConfig {
  name: string;
  endpoint: string;
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
  currentStatus: 'healthy' | 'unhealthy' | 'unknown';
  lastCheck?: HealthCheck;
  history: HealthCheck[];
  uptime?: number;
  averageResponseTime?: number;
}

export interface Stats {
  totalServices: number;
  healthyServices: number;
  unhealthyServices: number;
  unknownServices: number;
  isRunning: boolean;
}
