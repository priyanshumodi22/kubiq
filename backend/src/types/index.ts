export interface LogSource {
  id: string; // UUID or generated ID
  name: string; // Display name
  path: string; // File path or glob
}

export interface ServiceConfig {
  name: string;
  endpoint: string;
  type?: 'http' | 'tcp' | 'icmp' | 'mysql' | 'mongodb';
  interval?: number;
  timeout?: number;
  headers?: Record<string, string>;
  enabled?: boolean;
  ignoreSSL?: boolean; // New
  logPath?: string; // Legacy
  logSources?: LogSource[]; // New Multi-Log Support
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
  id?: string;
  name: string;
  endpoint: string;
  type?: 'http' | 'tcp' | 'icmp' | 'mysql' | 'mongodb';
  interval?: number;
  timeout?: number;
  headers?: Record<string, string>;
  currentStatus: 'healthy' | 'unhealthy' | 'unknown';
  logPath?: string;
  logSources?: LogSource[];
  lastCheck?: HealthCheck;
  history: HealthCheck[];
  uptime?: number;
  averageResponseTime?: number;
  ignoreSSL?: boolean; 
  sslExpiry?: Date | null; 
}

export interface CustomCheckRequest {
  service: string;
  endpoint: string;
}


export interface CustomCheckResponse {
  status: 'success' | 'error';
  data?: any;
  message?: string;
  responseTime?: number;
}

export type ChannelType = 'webhook' | 'email';

export interface NotificationChannel {
  id: string;
  name: string;
  type: ChannelType;
  config: {
    webhookUrl?: string;
    email?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: boolean;
    smtpUser?: string;
    smtpPass?: string;
    senderEmail?: string;
    [key: string]: any;
  };
  events: {
    up: boolean;
    down: boolean;
  };
  enabled: boolean;
  lastTriggered?: number;
}

export interface SystemConfig {
  slug: string | null;
  dashboardTitle: string;
  refreshInterval?: number;
}

export type UserRole = 'kubiq-admin' | 'kubiq-viewer';

export interface User {
  id: string; // UUID or Int->String
  username: string;
  passwordHash?: string; // Optional for security when sending to frontend
  email?: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  createdAt?: number;
  lastLogin?: number;
  enabled?: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}
export interface Passkey {
  id: string; // The Credential ID
  publicKey: string; // Base64 encoded public key
  userId: string; // Foreign key to User
  webAuthnUserID: string; // Unique user handle for WebAuthn
  name: string; // Friendly name for the passkey
  counter: number; // Replay protection
  transports?: string[]; 
  deviceType: string;
  backedUp: boolean;
  createdAt: number;
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
  cpuLoad: number; // Percentage
  memory: {
    total: number;
    active: number;
    used: number;
  };
  uptime: number;
  disks: DiskInfo[];
  timestamp?: number;
}
