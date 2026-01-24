import mongoose from 'mongoose';
import { IServiceRepository } from '../../interfaces/IServiceRepository';
import { ServiceStatus, ServiceConfig, HealthCheck, SystemConfig } from '../../../types';
import { ServiceModel, IServiceDocument } from '../../schemas/ServiceSchema';
import { SystemConfigModel } from '../../schemas/SystemConfigSchema';

export class MongoServiceRepository implements IServiceRepository {
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized || mongoose.connection.readyState === 1) {
        this.isInitialized = true;
        return;
    }

    const uri = process.env.DB_URI || `mongodb://${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 27017}/${process.env.DB_NAME || 'kubiq_db'}`;
    
    try {
        await mongoose.connect(uri);
        console.log('✅ Connected to MongoDB');
        this.isInitialized = true;
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error);
        throw error;
    }
  }

  async getAllServices(): Promise<ServiceStatus[]> {
    const services = await ServiceModel.find().lean();
    return services.map(this.mapToServiceStatus);
  }

  async getServiceByName(name: string): Promise<ServiceStatus | null> {
    const service = await ServiceModel.findOne({ name }).lean();
    return service ? this.mapToServiceStatus(service) : null;
  }

  async addService(service: ServiceConfig): Promise<ServiceStatus> {
    const newService = new ServiceModel(service);
    await newService.save();
    return this.mapToServiceStatus(newService.toObject());
  }

  async updateService(name: string, service: Partial<ServiceConfig>): Promise<ServiceStatus> {
    const updated = await ServiceModel.findOneAndUpdate(
        { name }, 
        { $set: service },
        { new: true }
    ).lean();
    
    if (!updated) {
        throw new Error(`Service ${name} not found`);
    }
    return this.mapToServiceStatus(updated);
  }

  async deleteService(name: string): Promise<void> {
    await ServiceModel.deleteOne({ name });
  }

  async saveCheckResult(serviceName: string, result: HealthCheck, extraData?: { sslExpiry?: Date | null }): Promise<void> {
    // 1. Update latest status fields
    // 2. Push to history array (capped via slice if needed, but let's just push for now)
    
    // Construct update object
    const update: any = {
        $set: {
            status: result.status,
            lastCheck: result.timestamp,
            responseTime: result.responseTime
        },
        $push: {
            history: {
                $each: [result],
                $sort: { timestamp: -1 },
                $slice: -100 // Keep last 100 records (as per MAX_HISTORY_SIZE default)
            }
        }
    };

    if (extraData && extraData.sslExpiry !== undefined) {
        update.$set.sslExpiry = extraData.sslExpiry;
    }

    await ServiceModel.updateOne(
        { name: serviceName },
        update
    );
  }

  async getServiceHistory(serviceName: string, limit: number = 50): Promise<HealthCheck[]> {
    const service = await ServiceModel.findOne({ name: serviceName }, { history: { $slice: limit } }).lean();
    return service?.history || [];
  }

  async getSystemConfig(): Promise<SystemConfig> {
    const config = await SystemConfigModel.findOne({ key: 'main' }).lean();
    if (config) {
        return {
            dashboardTitle: config.dashboardTitle,
            slug: config.slug
        };
    }
    // Default config
    return {
        dashboardTitle: 'Kubiq Dashboard',
        slug: 'status'
    };
  }

  async saveSystemConfig(config: SystemConfig): Promise<void> {
    await SystemConfigModel.updateOne(
        { key: 'main' },
        { $set: config },
        { upsert: true }
    );
  }

  async close(): Promise<void> {
    await mongoose.disconnect();
  }

  private mapToServiceStatus(doc: any): ServiceStatus {
      const history = doc.history || [];
      const lastCheck = history.length > 0 ? history[0] : undefined;

      return {
          id: doc._id.toString(),
          name: doc.name,
          endpoint: doc.endpoint,
          type: doc.type,
          interval: doc.interval,
          timeout: doc.timeout,
          headers: doc.headers,
          currentStatus: doc.status || 'unknown',
          lastCheck: lastCheck,
          history: history,
          ignoreSSL: doc.ignoreSSL,
          sslExpiry: doc.sslExpiry,
          logPath: doc.logPath,
          logSources: doc.logSources // Map logSources
      };
  }
}
