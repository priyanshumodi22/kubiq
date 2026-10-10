import { AuditLogEntry } from '../../services/AuditLogService';
export type AuditLogFilters = { action?: string; target?: string };

export interface IAuditLogRepository {
  initialize(): Promise<void>;
  addAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry>;
  getAuditLogs(limit?: number, search?: string, filters?: AuditLogFilters): Promise<AuditLogEntry[]>;
}
