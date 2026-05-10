import nodemailer from 'nodemailer';
import axios from 'axios';
import { NotificationChannel } from '../types';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { INotificationRepository } from '../database/interfaces/INotificationRepository';

export class NotificationManager {
  private static instance: NotificationManager;
  private channels: Map<string, NotificationChannel> = new Map();
  private repository!: INotificationRepository;
  private persistenceEnabled: boolean;
  public throttleMap = new Map<string, number>();
  private transporters = new Map<string, nodemailer.Transporter>();

  private constructor() {
    this.persistenceEnabled = process.env.ENABLE_PERSISTENCE === 'true';
    if (!this.persistenceEnabled) {
        console.log('⚠️ Persistence disabled for notifications');
    }
  }

  public static getInstance(): NotificationManager {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager();
    }
    return NotificationManager.instance;
  }

  public async initialize(): Promise<void> {
    try {
        if (this.persistenceEnabled) {
            this.repository = await DatabaseFactory.getNotificationRepository();
            const channels = await this.repository.getAllChannels();
            this.channels.clear();
            channels.forEach(c => this.channels.set(c.id, c));
            console.log(`🔔 Loaded ${this.channels.size} notification channels from repository`);
        }
    } catch (error) {
      console.error('❌ Failed to initialize NotificationManager:', error);
    }
  }

  public getChannels(): NotificationChannel[] {
    return Array.from(this.channels.values());
  }

  public getChannel(id: string): NotificationChannel | undefined {
      return this.channels.get(id);
  }

  public async addChannel(channel: Omit<NotificationChannel, 'id'>): Promise<NotificationChannel> {
    if (this.persistenceEnabled && this.repository) {
        const newChannel = await this.repository.addChannel(channel);
        this.channels.set(newChannel.id, newChannel);
        console.log(`🔔 Added notification channel: ${newChannel.name}`);
        return newChannel;
    } else {
        // In-memory fallback
        const id = Date.now().toString(); // Fallback ID
        const newChannel: NotificationChannel = { ...channel, id };
        this.channels.set(id, newChannel);
        return newChannel;
    }
  }

  public async updateChannel(id: string, updates: Partial<NotificationChannel>): Promise<NotificationChannel> {
    const channel = this.channels.get(id);
    if (!channel) throw new Error('Channel not found');

    if (this.persistenceEnabled && this.repository) {
        const updated = await this.repository.updateChannel(id, updates);
        this.channels.set(id, updated);
        console.log(`🔔 Updated notification channel: ${updated.name}`);
        return updated;
    } else {
        const updated = { ...channel, ...updates };
        this.channels.set(id, updated);
        return updated;
    }
  }

  public async deleteChannel(id: string): Promise<void> {
    if (this.persistenceEnabled && this.repository) {
        await this.repository.deleteChannel(id);
    }
    this.channels.delete(id);
    console.log(`🔔 Deleted notification channel: ${id}`);
  }

  public async sendTest(channelId: string): Promise<void> {
    const channel = this.channels.get(channelId);
    if (!channel) throw new Error('Channel not found');

    console.log(`🔔 Sending TEST notification to ${channel.name}`);
    await this.sendAlert(channel, '🔬 Test Notification', 'This is a test alert from Kubiq. If you see this, your configuration is correct! ✅');
  }

  public async notifyStatusChange(serviceName: string, status: 'healthy' | 'unhealthy', error?: string): Promise<void> {
    // Construct message
    const title = status === 'healthy' 
      ? `🟢 Service Recovered: ${serviceName}` 
      : `🔴 Service Down: ${serviceName}`;
    
    const timestamp = new Date().toLocaleString();
    
    // Simplified message body
    const message = status === 'healthy'
      ? `🕒 Time: ${timestamp}`
      : `Error: ${error || 'Unknown error'}\n🕒 Time: ${timestamp}`;

    const promises = Array.from(this.channels.values())
      .filter(c => c.enabled)
      .filter(c => (status === 'healthy' && c.events.up) || (status === 'unhealthy' && c.events.down))
      .map(channel => this.sendAlert(channel, title, message));

    await Promise.allSettled(promises);
  }

  private async sendAlert(channel: NotificationChannel, title: string, message: string): Promise<void> {
    try {
      await this.withRetry(async () => {
        if (channel.type === 'webhook') {
          await this.sendWebhook(channel, title, message);
        } else if (channel.type === 'email') {
          await this.sendEmail(channel, title, message);
        }
      }, 3); // 3 retries max
    } catch (error: any) {
      console.error(`❌ Failed to send notification to ${channel.name} after retries:`, error.message);
    }
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i < maxRetries - 1) {
          const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
          console.log(`⚠️ Notification attempt ${i + 1} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }

  private async sendWebhook(channel: NotificationChannel, title: string, message: string): Promise<void> {
    if (!channel.config.webhookUrl) throw new Error('Missing Webhook URL');
    
    // Determine payload based on provider
    let payload: any = {};
    const url = channel.config.webhookUrl.toLowerCase();
    
    if (url.includes('discord')) {
        payload = {
            content: `**${title}**\n${message}`
        };
    } else if (url.includes('slack')) {
        payload = {
            text: `*${title}*\n${message}`
        };
    } else if (url.includes('office') || url.includes('teams')) {
        payload = {
            title: title,
            text: message
        };
    } else if (url.includes('google')) {
        payload = {
            text: `*${title}*\n${message}`
        };
    } else {
        // Generic Default
        payload = { // Discord style default for broad compatibility
            content: `**${title}**\n${message}`, 
            text: `*${title}*\n${message}`,
            title: title,
            message: message
        };
    }

    // Add explicit Content-Type just in case
    await axios.post(channel.config.webhookUrl, payload, {
        headers: {
            'Content-Type': 'application/json'
        },
        timeout: 5000 // 5 second timeout to prevent hanging connections
    });
  }

  private async sendEmail(channel: NotificationChannel, title: string, message: string): Promise<void> {
    if (!channel.config.email) throw new Error('Missing recipient email');

    // Reuse existing transporter to avoid slow connection overhead
    let transporter = this.transporters.get(channel.id);
    
    if (!transporter) {
        transporter = nodemailer.createTransport({
          host: channel.config.smtpHost,
          port: channel.config.smtpPort || 587,
          secure: channel.config.smtpSecure || false,
          auth: {
            user: channel.config.smtpUser,
            pass: channel.config.smtpPass,
          },
          tls: {
            rejectUnauthorized: false
          }
        });
        this.transporters.set(channel.id, transporter);
    }

    const senderName = channel.config.senderName || 'Kubiq Alert';
    const senderEmail = channel.config.senderEmail || 'no-reply@kubiq.local';
    const from = `"${senderName}" <${senderEmail}>`;

    await transporter.sendMail({
      from,
      to: channel.config.email,
      cc: channel.config.cc,
      bcc: channel.config.bcc,
      subject: `[Kubiq] ${title}`,
      text: message,
      html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
              <h2 style="color: ${title.includes('Down') ? '#e11d48' : '#10b981'}">${title}</h2>
              <p style="white-space: pre-wrap;">${message}</p>
              <hr />
              <p style="font-size: 12px; color: #666;">Sent by Kubiq Monitoring</p>
             </div>`
    });
  }
}
