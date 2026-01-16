import { NotificationChannel } from '../../types';

export interface INotificationRepository {
  /**
   * Initialize connection or load data source
   */
  initialize(): Promise<void>;

  /**
   * Get all notification channels
   */
  getAllChannels(): Promise<NotificationChannel[]>;

  /**
   * Get a specific channel by ID
   */
  getChannelById(id: string): Promise<NotificationChannel | null>;

  /**
   * Add a new notification channel
   */
  addChannel(channel: Omit<NotificationChannel, 'id'>): Promise<NotificationChannel>;

  /**
   * Update an existing notification channel
   */
  updateChannel(id: string, channel: Partial<NotificationChannel>): Promise<NotificationChannel>;

  /**
   * Delete a channel by ID
   */
  deleteChannel(id: string): Promise<void>;
}
