import { ILogRepository } from '../../interfaces/ILogRepository';
import { LogModel } from '../../schemas/LogSchema';
import { ensureRetentionIndex } from './ensureRetentionIndex';
import { retentionSeconds } from '../../../utils/RetentionPolicy';

export class MongoLogRepository implements ILogRepository {
    async initialize(): Promise<void> {
        await ensureRetentionIndex(LogModel, retentionSeconds('LOG'));
    }

    async insertLogs(logs: any[]): Promise<void> {
        if (!logs || logs.length === 0) return;
        await LogModel.insertMany(logs, { ordered: false });
    }

    async queryLogs(serviceName: string, opts: {
        sourceName?: string;
        from: Date;
        to: Date;
        level?: string;
        search?: string;
        limit?: number;
    }): Promise<any[]> {
        const query: any = {
            serviceName,
            timestamp: { $gte: opts.from, $lte: opts.to }
        };

        if (opts.sourceName) {
            query.sourceName = opts.sourceName;
        }

        if (opts.level && opts.level.toUpperCase() !== 'ALL') {
            query.level = opts.level.toUpperCase();
        }

        if (opts.search) {
            query.$text = { $search: opts.search };
        }

        let mQuery = LogModel.find(query).sort({ timestamp: -1 });
        
        if (opts.limit) {
            mQuery = mQuery.limit(opts.limit);
        }

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
