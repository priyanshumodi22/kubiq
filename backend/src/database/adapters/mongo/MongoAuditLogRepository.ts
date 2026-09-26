import { IAuditLogRepository } from '../../interfaces/IAuditLogRepository';
import { AuditLogEntry } from '../../../services/AuditLogService';
import { AuditLogModel } from '../../schemas/AuditLogSchema';

export class MongoAuditLogRepository implements IAuditLogRepository {
  public async initialize(): Promise<void> {
    console.log('🍃 MongoAuditLogRepository initialized');
  }

  public async addAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
    const fullEntry: AuditLogEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...entry
    };

    await AuditLogModel.create(fullEntry);
    return fullEntry;
  }

  public async getAuditLogs(limit: number = 100, search?: string): Promise<AuditLogEntry[]> {
    let query: any = {};
    if (search && search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      query = {
        $or: [
          { user: regex },
          { action: regex },
          { target: regex },
          { details: regex }
        ]
      };
    }

    const docs = await AuditLogModel.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    return docs.map((doc: any) => ({
      id: doc.id,
      timestamp: doc.timestamp,
      user: doc.user,
      action: doc.action,
      target: doc.target,
      details: doc.details,
      ip: doc.ip
    }));
  }
}
