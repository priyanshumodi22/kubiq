import fs from 'fs';
import path from 'path';
import { IAuditLogRepository } from '../../interfaces/IAuditLogRepository';
import { AuditLogEntry } from '../../../services/AuditLogService';

export class JsonAuditLogRepository implements IAuditLogRepository {
  private logFilePath: string;
  private memoryLogs: AuditLogEntry[] = [];

  constructor() {
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
    }
    this.logFilePath = path.join(dataDir, 'audit_logs.json');
  }

  public async initialize(): Promise<void> {
    this.loadLogs();
  }

  private loadLogs() {
    try {
      if (fs.existsSync(this.logFilePath)) {
        const raw = fs.readFileSync(this.logFilePath, 'utf-8');
        this.memoryLogs = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('⚠️ Failed to read audit_logs.json, initializing empty log store.');
      this.memoryLogs = [];
    }
  }

  private saveLogs() {
    try {
      if (this.memoryLogs.length > 5000) {
        this.memoryLogs = this.memoryLogs.slice(0, 5000);
      }
      fs.writeFileSync(this.logFilePath, JSON.stringify(this.memoryLogs, null, 2), 'utf-8');
    } catch (e) {
      console.error('❌ Failed to write to audit_logs.json:', e);
    }
  }

  public async addAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
    const fullEntry: AuditLogEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...entry
    };

    this.memoryLogs.unshift(fullEntry);
    this.saveLogs();
    return fullEntry;
  }

  public async getAuditLogs(limit: number = 100, search?: string): Promise<AuditLogEntry[]> {
    let filtered = this.memoryLogs;
    if (search && search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(l => 
        l.user.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.target.toLowerCase().includes(q) ||
        (l.details && l.details.toLowerCase().includes(q))
      );
    }
    return filtered.slice(0, limit);
  }
}
