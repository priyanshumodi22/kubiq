import { databaseDetailsEnabled } from '../../../telemetry/databaseSpan';
import mongoose from 'mongoose';
import { KubernetesLogConfig, ISystemRepository, LicenseActivation, KubiAiConfigRecord, RbacConfigRecord } from '../../interfaces/ISystemRepository';
import { SystemMetrics } from '../../../types';
import { SystemMetricsModel } from '../../schemas/SystemMetricsSchema';
import { SystemPreferencesModel } from '../../schemas/SystemPreferencesSchema';

export class MongoSystemRepository implements ISystemRepository {
    private readonly configKey = 'storage_prefs';
    private readonly apmConfigKey = 'apm_prefs';
    private readonly licenseActivationKey = 'polar_license_activation';
    private readonly kubiAiConfigKey = 'kubi_ai_config';
    private readonly rbacConfigKey = 'rbac_config';

    async initialize(): Promise<void> {
        if (mongoose.connection.readyState === 0) {
            const uri = process.env.DB_URI || `mongodb://${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 27017}/${process.env.DB_NAME || 'kubiq_db'}`;
            await mongoose.connect(uri, { monitorCommands: databaseDetailsEnabled() });
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
        if (doc?.value) {
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

    async getApmConfig(): Promise<{ ignoredRoutes: string[] }> {
        await this.initialize();
        const doc = await SystemPreferencesModel.findOne({ key: this.apmConfigKey }).lean();
        if (doc?.value) {
            return doc.value;
        }
        return { ignoredRoutes: ['/health', '/metrics', '/favicon.ico'] };
    }

    async updateApmConfig(config: { ignoredRoutes: string[] }): Promise<void> {
        await this.initialize();
        await SystemPreferencesModel.findOneAndUpdate(
            { key: this.apmConfigKey },
            { key: this.apmConfigKey, value: config },
            { upsert: true, new: true }
        );
    }

    async getLicenseActivation(): Promise<LicenseActivation | null> {
        await this.initialize();
        const doc = await SystemPreferencesModel.findOne({ key: this.licenseActivationKey }).lean();
        const value = doc?.value as Partial<LicenseActivation> | undefined;
        return value?.keyFingerprint && value.activationId
            ? { keyFingerprint: value.keyFingerprint, activationId: value.activationId }
            : null;
    }

    async saveLicenseActivation(activation: LicenseActivation): Promise<void> {
        await this.initialize();
        await SystemPreferencesModel.findOneAndUpdate(
            { key: this.licenseActivationKey },
            { key: this.licenseActivationKey, value: activation },
            { upsert: true, new: true }
        );
    }

    async getKubiAiConfig(): Promise<KubiAiConfigRecord | null> {
        await this.initialize();
        const doc = await SystemPreferencesModel.findOne({ key: this.kubiAiConfigKey }).lean();
        const value = doc?.value as Partial<KubiAiConfigRecord> | undefined;
        return value?.provider && value.model && value.encryptedApiKey && value.updatedAt ? value as KubiAiConfigRecord : null;
    }

    async saveKubiAiConfig(config: KubiAiConfigRecord): Promise<void> {
        await this.initialize();
        await SystemPreferencesModel.findOneAndUpdate(
            { key: this.kubiAiConfigKey },
            { key: this.kubiAiConfigKey, value: config },
            { upsert: true, new: true }
        );
    }

    async getRbacConfig(): Promise<RbacConfigRecord | null> {
        await this.initialize();
        const doc = await SystemPreferencesModel.findOne({ key: this.rbacConfigKey }).lean();
        const value = doc?.value as Partial<RbacConfigRecord> | undefined;
        return value?.version === 1 && Array.isArray(value.roles) && typeof value.updatedAt === 'number' ? value as RbacConfigRecord : null;
    }

    async saveRbacConfig(config: RbacConfigRecord): Promise<void> {
        await this.initialize();
        await SystemPreferencesModel.findOneAndUpdate(
            { key: this.rbacConfigKey },
            { key: this.rbacConfigKey, value: config },
            { upsert: true, new: true }
        );
    }
  async getKubernetesLogConfig(): Promise<KubernetesLogConfig | null> {
        await this.initialize();
        const doc = await SystemPreferencesModel.findOne({ key: 'kubernetes-log-sources' }).lean();
        const value = doc?.value as Partial<KubernetesLogConfig> | undefined;
        return value?.version === 1 && Array.isArray(value.sources) && typeof value.updatedAt === 'number' ? value as KubernetesLogConfig : null;
    }

    async saveKubernetesLogConfig(config: KubernetesLogConfig): Promise<void> {
        await this.initialize();
        await SystemPreferencesModel.findOneAndUpdate(
            { key: 'kubernetes-log-sources' },
            { key: 'kubernetes-log-sources', value: config },
            { upsert: true, new: true }
        );
    }
}
