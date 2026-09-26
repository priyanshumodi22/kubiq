import { AuditLogEntry } from '../../services/AuditLogService';

export interface IAuditLogRepository {
  initialize(): Promise<void>;
  addAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry>;
  getAuditLogs(limit?: number, search?: string): Promise<AuditLogEntry[]>;
}
