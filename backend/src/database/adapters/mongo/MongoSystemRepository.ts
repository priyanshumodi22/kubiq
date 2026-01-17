import mongoose from 'mongoose';
import { ISystemRepository } from '../../interfaces/ISystemRepository';
import { SystemMetrics } from '../../../types';
import { SystemMetricsModel } from '../../schemas/SystemMetricsSchema';
import { SystemPreferencesModel } from '../../schemas/SystemPreferencesSchema';

export class MongoSystemRepository implements ISystemRepository {
    private readonly configKey = 'storage_prefs';

    async initialize(): Promise<void> {
        if (mongoose.connection.readyState === 0) {
            const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/kubiq';
            await mongoose.connect(uri);
        }
    }

    async saveMetrics(metrics: SystemMetrics): Promise<void> {
        await this.initialize();
        await SystemMetricsModel.create({
            cpuLoad: metrics.cpuLoad,
            memoryUsed: metrics.memory.used,
            memoryTotal: metrics.memory.total,
            diskUsage: metrics.disks,
            timestamp: metrics.timestamp ? new Date(metrics.timestamp) : new Date()
        });
    }

    async getMetricsHistory(limit: number = 1000): Promise<SystemMetrics[]> {
        await this.initialize();
        const docs = await SystemMetricsModel.find()
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();

        return docs.map((doc: any) => ({
            cpuLoad: doc.cpuLoad,
            memory: {
                total: doc.memoryTotal,
                used: doc.memoryUsed,
                active: doc.memoryUsed
            },
            uptime: 0,
            disks: doc.diskUsage,
            timestamp: doc.timestamp instanceof Date ? doc.timestamp.getTime() : new Date(doc.timestamp).getTime()
        }));
    }

    async getStorageConfig(): Promise<{ allowedMounts: string[] }> {
        await this.initialize();
        const doc = await SystemPreferencesModel.findOne({ key: this.configKey }).lean();
        if (doc && doc.value) {
            return doc.value;
        }
        return { allowedMounts: [] };
    }

    async updateStorageConfig(config: { allowedMounts: string[] }): Promise<void> {
        await this.initialize();
        await SystemPreferencesModel.findOneAndUpdate(
            { key: this.configKey },
            { key: this.configKey, value: config },
            { upsert: true, new: true }
        );
    }
}
