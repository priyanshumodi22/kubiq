import { INotificationRepository } from '../../interfaces/INotificationRepository';
import { NotificationChannel } from '../../../types';
import { NotificationModel } from '../../schemas/NotificationSchema';

export class MongoNotificationRepository implements INotificationRepository {
  async initialize(): Promise<void> {
    // Connection handled by ServiceRepository or shared connection logic
    // We assume Mongoose is connected by the time this is called, or will be.
    // If not, we could check state, but typically Service Repo init runs first in DatabaseFactory logic (if we add sequential wait).
    // Actually, DatabaseFactory calls GetServiceRepo and runs initialize.
    // Ideally we should have a shared connection manager, but for now relying on Mongoose singleton is fine.
  }

  async getAllChannels(): Promise<NotificationChannel[]> {
    const channels = await NotificationModel.find().lean();
    return channels.map(this.mapToChannel);
  }

  async getChannelById(id: string): Promise<NotificationChannel | null> {
    const channel = await NotificationModel.findById(id).lean();
    return channel ? this.mapToChannel(channel) : null;
  }

  async addChannel(channel: Omit<NotificationChannel, 'id'>): Promise<NotificationChannel> {
    const newChannel = new NotificationModel(channel);
    await newChannel.save();
    return this.mapToChannel(newChannel.toObject());
  }

  async updateChannel(id: string, channel: Partial<NotificationChannel>): Promise<NotificationChannel> {
    const updated = await NotificationModel.findByIdAndUpdate(
        id,
        { $set: channel },
        { new: true }
    ).lean();
    
    if (!updated) {
        throw new Error(`Notification Channel ${id} not found`);
    }
    return this.mapToChannel(updated);
  }

  async deleteChannel(id: string): Promise<void> {
    await NotificationModel.findByIdAndDelete(id);
  }

  private mapToChannel(doc: any): NotificationChannel {
      return {
          id: doc._id.toString(),
          name: doc.name,
          type: doc.type,
          config: doc.config,
          events: doc.events,
          enabled: doc.enabled,
          lastTriggered: doc.lastTriggered
      };
  }
}
