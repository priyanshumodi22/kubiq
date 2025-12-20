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
  currentStatus: "healthy" | "unhealthy" | "unknown";
  lastCheck?: HealthCheck;
  history: HealthCheck[];
  uptime?: number;
  averageResponseTime?: number;
}

export interface CustomCheckRequest {
  service: string;
  endpoint: string;
}

export interface CustomCheckResponse {
  status: "success" | "error";
  data?: any;
  message?: string;
  responseTime?: number;
}
