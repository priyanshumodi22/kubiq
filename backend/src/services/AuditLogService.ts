import { DatabaseFactory } from '../database/DatabaseFactory';
import { IAuditLogRepository } from '../database/interfaces/IAuditLogRepository';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: 'TTY_EXEC' | 'MANIFEST_APPLY' | 'DEPLOYMENT_SCALE' | 'DEPLOYMENT_RESTART' | 'RESOURCE_DELETE' | 'AUTH_LOGIN' | 'AUTH_ROLE_CHANGE';
  target: string;
  details?: string;
  ip?: string;
}

export class AuditLogService {
  private static instance: AuditLogService;
  private repository!: IAuditLogRepository;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): AuditLogService {
    if (!AuditLogService.instance) {
      AuditLogService.instance = new AuditLogService();
    }
    return AuditLogService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    try {
      this.repository = await DatabaseFactory.getAuditLogRepository();
      this.isInitialized = true;
      console.log('🛡️ AuditLogService initialized with DB repository');
    } catch (e) {
      console.error('❌ Failed to initialize AuditLogService repository:', e);
    }
  }

  private async getRepo(): Promise<IAuditLogRepository> {
    if (!this.repository) {
      await this.initialize();
    }
    return this.repository;
  }

  public async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry | null> {
    try {
      const repo = await this.getRepo();
      const fullEntry = await repo.addAuditLog(entry);
      console.log(`🛡️ [AuditLog] [${fullEntry.action}] User: ${fullEntry.user} → Target: ${fullEntry.target}`);
      return fullEntry;
    } catch (err) {
      console.error('❌ Failed to save audit log entry:', err);
      return null;
    }
  }

  public async getLogs(limit: number = 100, search?: string): Promise<AuditLogEntry[]> {
    const repo = await this.getRepo();
    return repo.getAuditLogs(limit, search);
  }
}
