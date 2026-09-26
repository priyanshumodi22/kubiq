import nodemailer from 'nodemailer';
import axios from 'axios';
import { NotificationChannel } from '../types';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { INotificationRepository } from '../database/interfaces/INotificationRepository';

export interface AlertPayload {
  title: string;
  status: 'healthy' | 'unhealthy' | 'warning' | 'info';
  serviceName?: string;
  target?: string;
  error?: string;
  details?: Record<string, string | number | undefined>;
  timestamp?: Date;
}

interface FormattedCard {
  title: string;
  status: 'healthy' | 'unhealthy' | 'warning' | 'info';
  colorHex: string;
  colorDec: number;
  fields: { name: string; value: string; inline?: boolean }[];
  formattedTime: string;
  unixSec: number;
  timestamp: Date;
}

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
      const id = Date.now().toString();
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

    console.log(`🔔 Sending TEST card notification to ${channel.name}`);
    await this.sendAlertCard(channel, {
      title: 'Deployment recovered: flux-system/kubiq-web',
      status: 'healthy',
      serviceName: 'flux-system/kubiq-web',
      target: 'flux-system/kubiq-web',
      details: {
        'State': 'Flux and Kubernetes rollout are healthy',
        'Flux revision': 'main@sha1:6f39934ea52d5956d247292233c98367b8c76357'
      }
    });
  }

  public async notifyStatusChange(
    serviceName: string,
    status: 'healthy' | 'unhealthy',
    error?: string,
    extraDetails?: Record<string, any>
  ): Promise<void> {
    const isHealthy = status === 'healthy';
    const title = isHealthy
      ? `Deployment recovered: ${serviceName}`
      : `Deployment degraded: ${serviceName}`;

    const details: Record<string, string> = {
      'State': isHealthy ? 'Flux and Kubernetes rollout are healthy' : 'Service health check degraded or failing',
      'Target': serviceName
    };

    if (!isHealthy && error) {
      details['Detail'] = error;
    }
    if (extraDetails?.endpoint) {
      details['Endpoint'] = String(extraDetails.endpoint);
    }
    if (extraDetails?.responseTime) {
      details['Latency'] = `${extraDetails.responseTime}ms`;
    }

    const payload: AlertPayload = {
      title,
      status,
      serviceName,
      target: serviceName,
      error,
      details,
      timestamp: new Date()
    };

    const promises = Array.from(this.channels.values())
      .filter(c => c.enabled)
      .filter(c => (isHealthy && c.events.up) || (!isHealthy && c.events.down))
      .map(channel => this.sendAlertCard(channel, payload));

    await Promise.allSettled(promises);
  }

  public async notifyCustomAlert(
    title: string,
    message: string,
    extraDetails?: Record<string, any>
  ): Promise<void> {
    const lowerTitle = title.toLowerCase();
    const isUnhealthy = lowerTitle.includes('alert') || lowerTitle.includes('error') || lowerTitle.includes('down') || lowerTitle.includes('fail');
    const isWarning = lowerTitle.includes('warning') || lowerTitle.includes('degraded');
    const status: 'healthy' | 'unhealthy' | 'warning' | 'info' = isUnhealthy ? 'unhealthy' : isWarning ? 'warning' : 'info';

    const cleanTitle = title.replace(/^[\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F680}-\u{1F6FF}\u{26A0}-\u{26FF}]\s*/u, '');

    const details: Record<string, string> = { ...extraDetails };
    if (message) {
      const lines = message.split('\n');
      lines.forEach(line => {
        const parts = line.split(':');
        if (parts.length >= 2) {
          const key = parts[0].replace(/^[\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F680}-\u{1F6FF}\u{26A0}-\u{26FF}]\s*/u, '').trim();
          const val = parts.slice(1).join(':').trim();
          if (key && val && key.toLowerCase() !== 'time') {
            details[key] = val;
          }
        } else if (line.trim() && !details['State']) {
          details['State'] = line.trim();
        }
      });
    }

    if (!details['State']) {
      details['State'] = isUnhealthy ? 'Resource state failing or degraded' : 'Event notification triggered';
    }

    const payload: AlertPayload = {
      title: cleanTitle,
      status,
      serviceName: details['Target'] || details['Namespace'] || 'kubiq System',
      details,
      timestamp: new Date()
    };

    const promises = Array.from(this.channels.values())
      .filter(c => c.enabled)
      .map(channel => this.sendAlertCard(channel, payload));

    await Promise.allSettled(promises);
  }

  // Backward compatible sendAlert signature
  public async sendAlert(channel: NotificationChannel, title: string, message: string): Promise<void> {
    const isHealthy = title.toLowerCase().includes('healthy') || title.toLowerCase().includes('recovered') || title.toLowerCase().includes('test');
    const status = isHealthy ? 'healthy' : 'unhealthy';

    await this.sendAlertCard(channel, {
      title: title.replace(/^[\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F680}-\u{1F6FF}\u{26A0}-\u{26FF}]\s*/u, ''),
      status,
      details: {
        'State': message
      },
      timestamp: new Date()
    });
  }

  private async sendAlertCard(channel: NotificationChannel, payload: AlertPayload): Promise<void> {
    const formattedCard = this.formatCard(payload);
    try {
      await this.withRetry(async () => {
        if (channel.type === 'webhook') {
          await this.sendWebhookCard(channel, formattedCard);
        } else if (channel.type === 'email') {
          await this.sendEmailCard(channel, formattedCard);
        }
      }, 3);
    } catch (error: any) {
      console.error(`❌ Failed to send card notification to ${channel.name}:`, error.message);
    }
  }

  private formatCard(payload: AlertPayload): FormattedCard {
    const timestamp = payload.timestamp || new Date();
    const unixSec = Math.floor(timestamp.getTime() / 1000);
    const formattedTime = `${timestamp.toISOString().replace('T', ' ').substring(0, 19)} UTC`;

    let colorHex = '#10b981'; // Green (Healthy)
    let colorDec = 1095793;

    if (payload.status === 'unhealthy') {
      colorHex = '#ef4444'; // Red (Down/Degraded)
      colorDec = 15670340;
    } else if (payload.status === 'warning') {
      colorHex = '#f59e0b'; // Amber (Warning)
      colorDec = 16097547;
    } else if (payload.status === 'info') {
      colorHex = '#3b82f6'; // Blue (Info)
      colorDec = 3900150;
    }

    const fields: { name: string; value: string; inline?: boolean }[] = [];

    if (payload.details) {
      Object.entries(payload.details).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          fields.push({
            name: k,
            value: String(v),
            inline: k.length < 15
          });
        }
      });
    }

    if (fields.length === 0) {
      fields.push({
        name: 'State',
        value: payload.status === 'healthy' ? 'Operational' : 'Alert Triggered',
        inline: true
      });
    }

    return {
      title: payload.title,
      status: payload.status,
      colorHex,
      colorDec,
      fields,
      formattedTime,
      unixSec,
      timestamp
    };
  }

  private async sendWebhookCard(channel: NotificationChannel, card: FormattedCard): Promise<void> {
    if (!channel.config.webhookUrl) throw new Error('Missing Webhook URL');

    const url = channel.config.webhookUrl.toLowerCase();
    let bodyPayload: any = {};

    if (url.includes('discord')) {
      // Discord Rich Embed with native dynamic local timestamp tags (<t:UNIX:f>)
      const discordFields = [
        ...card.fields,
        {
          name: 'Time',
          value: `<t:${card.unixSec}:f> (<t:${card.unixSec}:R>)`,
          inline: false
        }
      ];

      bodyPayload = {
        embeds: [
          {
            title: card.title,
            color: card.colorDec,
            fields: discordFields,
            footer: {
              text: `kubiq Alert Manager`
            },
            timestamp: card.timestamp.toISOString()
          }
        ]
      };
    } else if (url.includes('slack')) {
      // Slack Block Kit with native local date tag
      bodyPayload = {
        attachments: [
          {
            color: card.colorHex,
            blocks: [
              {
                type: 'header',
                text: {
                  type: 'plain_text',
                  text: card.title,
                  emoji: true
                }
              },
              {
                type: 'section',
                fields: card.fields.map(f => ({
                  type: 'mrkdwn',
                  text: `*${f.name}*\n${f.value}`
                }))
              },
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: `🕒 *Time:* <!date^${card.unixSec}^{date_short_pretty} {time}|${card.formattedTime}>`
                  }
                ]
              }
            ]
          }
        ]
      };
    } else if (url.includes('office') || url.includes('teams')) {
      // MS Teams MessageCard
      bodyPayload = {
        '@type': 'MessageCard',
        '@context': 'http://schema.org/extensions',
        themeColor: card.colorHex.replace('#', ''),
        summary: card.title,
        sections: [
          {
            activityTitle: card.title,
            facts: [
              ...card.fields.map(f => ({ name: `${f.name}:`, value: f.value })),
              { name: 'Time:', value: card.formattedTime }
            ],
            markdown: true
          }
        ]
      };
    } else if (url.includes('telegram')) {
      const fieldLines = card.fields.map(f => `<b>${f.name}:</b> ${f.value}`).join('\n');
      bodyPayload = {
        text: `<b>${card.title}</b>\n\n${fieldLines}\n\n🕒 <i>${card.formattedTime}</i>`,
        parse_mode: 'HTML'
      };
    } else if (url.includes('pagerduty')) {
      bodyPayload = {
        payload: {
          summary: card.title,
          severity: card.status === 'unhealthy' ? 'error' : card.status === 'warning' ? 'warning' : 'info',
          source: 'kubiq Monitoring SRE',
          custom_details: card.fields.reduce((acc, f) => ({ ...acc, [f.name]: f.value }), {})
        },
        event_action: card.status === 'unhealthy' ? 'trigger' : 'resolve'
      };
    } else {
      // Generic Webhook Fallback
      bodyPayload = {
        title: card.title,
        status: card.status,
        color: card.colorHex,
        fields: card.fields,
        timestamp: card.timestamp.toISOString(),
        embeds: [
          {
            title: card.title,
            color: card.colorDec,
            fields: card.fields,
            timestamp: card.timestamp.toISOString()
          }
        ]
      };
    }

    await axios.post(channel.config.webhookUrl, bodyPayload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });
  }

  private async sendEmailCard(channel: NotificationChannel, card: FormattedCard): Promise<void> {
    if (!channel.config.email) throw new Error('Missing recipient email');

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

    const senderName = channel.config.senderName || 'kubiq Alert';
    const senderEmail = channel.config.senderEmail || 'no-reply@kubiq.local';
    const from = `"${senderName}" <${senderEmail}>`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; background-color: #0d0d0d; border-radius: 12px; overflow: hidden; border: 1px solid #27272a;">
        <div style="border-left: 5px solid ${card.colorHex}; padding: 24px;">
          <h2 style="margin: 0 0 16px 0; font-size: 16px; color: #ffffff; font-weight: 700; line-height: 1.4;">
            ${card.title}
          </h2>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            ${card.fields.map(f => `
              <tr style="border-bottom: 1px solid #18181b;">
                <td style="padding: 10px 0; color: #9ca3af; font-size: 12px; font-weight: 600; width: 35%; text-transform: uppercase; letter-spacing: 0.5px;">${f.name}</td>
                <td style="padding: 10px 0; color: #f4f4f5; font-size: 13px; font-weight: 500; font-family: monospace;">${f.value}</td>
              </tr>
            `).join('')}
          </table>
          <div style="padding-top: 12px; font-size: 11px; color: #71717a; border-top: 1px solid #27272a;">
            🕒 ${card.formattedTime} • kubiq SRE Alert Manager
          </div>
        </div>
      </div>
    `;

    const textBody = `${card.title}\n\n` + card.fields.map(f => `${f.name}: ${f.value}`).join('\n') + `\n\n🕒 ${card.formattedTime}`;

    await transporter.sendMail({
      from,
      to: channel.config.email,
      cc: channel.config.cc,
      bcc: channel.config.bcc,
      subject: `[kubiq] ${card.title}`,
      text: textBody,
      html: htmlBody
    });
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i < maxRetries - 1) {
          const delay = Math.pow(2, i) * 1000;
          console.log(`⚠️ Notification attempt ${i + 1} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }
}
