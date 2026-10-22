import {
  AuditLogFilters,
  AuditLogPage,
  IAuditLogRepository,
} from '../../interfaces/IAuditLogRepository';
import { AuditLogEntry } from '../../../services/AuditLogService';
import { AuditLogModel } from '../../schemas/AuditLogSchema';
import { newAuditId } from '../../../utils/auditId';

export class MongoAuditLogRepository implements IAuditLogRepository {
  public async initialize(): Promise<void> {
    console.log('🍃 MongoAuditLogRepository initialized');
  }

  public async addAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
    const fullEntry: AuditLogEntry = {
      id: newAuditId(),
      timestamp: new Date().toISOString(),
      ...entry,
    };

    await AuditLogModel.create(fullEntry);
    return fullEntry;
  }

  public async getAuditLogs(
    limit: number = 100,
    search?: string,
    filters?: AuditLogFilters
  ): Promise<AuditLogEntry[]> {
    let query: any = {};
    if (search?.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      query = {
        $or: [{ user: regex }, { action: regex }, { target: regex }, { details: regex }],
      };
    }

    if (filters?.action) query.action = filters.action;
    if (filters?.target) query.target = filters.target;
    const docs = await AuditLogModel.find(query).sort({ timestamp: -1 }).limit(limit).lean();

    return docs.map((doc: any) => ({
      id: doc.id,
      timestamp: doc.timestamp,
      user: doc.user,
      action: doc.action,
      target: doc.target,
      details: doc.details,
      ip: doc.ip,
    }));
  }

  public async getAuditLogPage(
    limit: number,
    offset: number,
    search?: string
  ): Promise<AuditLogPage> {
    const query = this.queryForSearch(search);
    const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const [docs, total] = await Promise.all([
      AuditLogModel.find(query).sort({ timestamp: -1 }).skip(safeOffset).limit(safeLimit).lean(),
      AuditLogModel.countDocuments(query),
    ]);
    return {
      records: docs.map((doc: any) => ({
        id: doc.id,
        timestamp: doc.timestamp,
        user: doc.user,
        action: doc.action,
        target: doc.target,
        details: doc.details,
        ip: doc.ip,
      })),
      total,
    };
  }

  private queryForSearch(search?: string): any {
    if (!search?.trim()) return {};
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    return { $or: [{ user: regex }, { action: regex }, { target: regex }, { details: regex }] };
  }
}
