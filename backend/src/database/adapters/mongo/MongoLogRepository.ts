import { traceIdFromRecord, traceMessagePattern, spanIdFromRecord, eventIdFromRecord } from '../../../utils/logCorrelation';
import { ILogRepository, LogQueryOptions } from '../../interfaces/ILogRepository';
import { LogModel } from '../../schemas/LogSchema';
import { ensureRetentionIndex } from './ensureRetentionIndex';
import { retentionSeconds } from '../../../utils/RetentionPolicy';

export class MongoLogRepository implements ILogRepository {
    async initialize(): Promise<void> {
        await ensureRetentionIndex(LogModel, retentionSeconds('LOG'));
    }

    async insertLogs(logs: any[]): Promise<void> {
        if (!logs || logs.length === 0) return;
        await LogModel.insertMany(logs.map(log => ({ ...log, traceId: traceIdFromRecord(log) || undefined, spanId: spanIdFromRecord(log) || undefined, eventId: eventIdFromRecord(log) || undefined })), { ordered: false });
    }

    async queryLogs(serviceName: string, opts: LogQueryOptions): Promise<any[]> {
        const query: any = {
            serviceName: opts.serviceNames ? { $in: opts.serviceNames } : serviceName,
            timestamp: { $gte: opts.from, $lte: opts.to }
        };

        if (opts.sourceName) {
            query.sourceName = opts.sourceName;
        }

        if (opts.level && opts.level.toUpperCase() !== 'ALL') {
            query.level = opts.level.toUpperCase();
        }

        if (opts.traceId) {
            query.$or = [{ traceId: opts.traceId }, { 'metadata.traceId': opts.traceId }, { 'metadata.trace_id': opts.traceId }, { message: { $regex: traceMessagePattern(opts.traceId), $options: 'i' } }];
        }
        if (opts.spanId) query.$and = [{ $or: [{ spanId: opts.spanId }, { 'metadata.spanId': opts.spanId }, { 'metadata.span_id': opts.spanId }, { message: { $regex: traceMessagePattern(opts.spanId), $options: 'i' } }] }];
        if (opts.search) {
            query.$text = { $search: opts.search };
        }

        let mQuery = LogModel.find(query).sort({ timestamp: -1 });
        
        if (opts.limit) {
            mQuery = mQuery.limit(opts.limit);
        }

        if (opts.traceId) mQuery = mQuery.maxTimeMS(5000);
        const results = await mQuery.lean().exec();
        return results;
    }

    async deleteLogsBefore(cutoff: Date): Promise<number> {
        const result = await LogModel.deleteMany({ timestamp: { $lt: cutoff } });
        return result.deletedCount || 0;
    }

    async getLogSourcesForService(serviceName: string): Promise<string[]> {
        return await LogModel.distinct('sourceName', { serviceName }).exec();
    }

    async getServices(): Promise<string[]> {
        return await LogModel.distinct('serviceName').exec();
    }
}
