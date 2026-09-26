import express from 'express';
import { NotificationManager } from '../services/NotificationManager';
import { NotificationChannel } from '../types';
import { requireRole, hasRole, getUserFromReq } from '../middleware/auth';
import { AuditLogService } from '../services/AuditLogService';

const router = express.Router();
const notificationManager = NotificationManager.getInstance();
const auditService = AuditLogService.getInstance();

// GET /api/notifications - List all channels
router.get('/', (req, res) => {
  try {
    const channels = notificationManager.getChannels();
    
    // Check if user is admin
    const isAdmin = hasRole(req.user, 'kubiq-admin');

    if (!isAdmin) {
      // Mask sensitive data for non-admins
      const maskedChannels = channels.map(channel => ({
        ...channel,
        config: {
          ...channel.config,
          webhookUrl: channel.config.webhookUrl ? '****************' : undefined,
          smtpPass: channel.config.smtpPass ? '********' : undefined,
          email: channel.config.email ? maskEmail(channel.config.email) : undefined,
          senderEmail: channel.config.senderEmail ? maskEmail(channel.config.senderEmail) : undefined,
          smtpHost: channel.config.smtpHost ? '********' : undefined,
        }
      }));
      return res.json(maskedChannels);
    }

    res.json(channels);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

function maskEmail(emailStr: string): string {
    if (!emailStr) return '';
    const emails = emailStr.split(',');
    
    return emails.map(email => {
        email = email.trim();
        const [user, domain] = email.split('@');
        if (!domain) return '********'; // Fallback if invalid format
        // Show first 2 chars if length > 2, else show 1 char
        const prefix = user.length > 2 ? user.substring(0, 2) : user.substring(0, 1);
        return `${prefix}***@${domain}`;
    }).join(', ');
}

// POST /api/notifications - Create a channel (Admin only)
router.post('/', requireRole('kubiq-admin'), async (req, res) => {
  try {
    const { name, type, config, enabled, events } = req.body;
    
    if (!name || !type) {
      res.status(400).json({ message: 'Name and Type are required' });
        return;
    }

    // Default events if not provided
    const channelEvents = events || { up: true, down: true };
    const isEnabled = enabled !== undefined ? enabled : true;

    const newChannel = await notificationManager.addChannel({
      name,
      type,
      config: config || {},
      enabled: isEnabled,
      events: channelEvents
    });

    auditService.log({
      user: getUserFromReq(req),
      action: 'NOTIFICATION_CHANNEL_CREATE',
      target: `channel/${newChannel.name}`,
      details: `Created notification channel '${newChannel.name}' (${newChannel.type})`,
      ip: req.ip
    });

    res.status(201).json(newChannel);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/notifications/:id - Update a channel (Admin only)
router.put('/:id', requireRole('kubiq-admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updatedChannel = await notificationManager.updateChannel(id as string, updates);

    auditService.log({
      user: getUserFromReq(req),
      action: 'NOTIFICATION_CHANNEL_UPDATE',
      target: `channel/${updatedChannel.name}`,
      details: `Updated configuration for channel '${updatedChannel.name}'`,
      ip: req.ip
    });

    res.json(updatedChannel);
  } catch (error: any) {
    if (error.message === 'Channel not found') {
      res.status(404).json({ message: 'Channel not found' });
    } else {
      res.status(500).json({ message: error.message });
    }
  }
});

// DELETE /api/notifications/:id - Delete a channel (Admin only)
router.delete('/:id', requireRole('kubiq-admin'), async (req, res) => {
  try {
    const { id } = req.params;
    await notificationManager.deleteChannel(id as string);

    auditService.log({
      user: getUserFromReq(req),
      action: 'NOTIFICATION_CHANNEL_DELETE',
      target: `channel/${id}`,
      details: `Deleted notification channel`,
      ip: req.ip
    });

    res.json({ message: 'Channel deleted' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/notifications/:id/test - Test a channel (Allowed for all authenticated users)
router.post('/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    await notificationManager.sendTest(id);

    auditService.log({
      user: getUserFromReq(req),
      action: 'NOTIFICATION_CHANNEL_TEST',
      target: `channel/${id}`,
      details: `Dispatched test alert notification`,
      ip: req.ip
    });

    res.json({ message: 'Test notification sent' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/notifications/history - View alert dispatch history
router.get('/history', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const history = notificationManager.getHistory(limit);
    res.json(history);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/notifications/history - Clear alert dispatch history
router.delete('/history', requireRole('kubiq-admin'), (req, res) => {
  try {
    notificationManager.clearHistory();

    auditService.log({
      user: getUserFromReq(req),
      action: 'ALERT_HISTORY_CLEAR',
      target: `notification/history`,
      details: `Cleared notification alert dispatch history`,
      ip: req.ip
    });

    res.json({ message: 'Alert history cleared' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/notifications/maintenance - Get maintenance & mute configuration
router.get('/maintenance', (req, res) => {
  try {
    const config = notificationManager.getMaintenanceConfig();
    res.json(config);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/notifications/maintenance - Update maintenance & mute configuration
router.post('/maintenance', requireRole('kubiq-admin'), (req, res) => {
  try {
    const updatedConfig = notificationManager.setMaintenanceConfig(req.body);

    auditService.log({
      user: getUserFromReq(req),
      action: 'MAINTENANCE_MODE_UPDATE',
      target: `notification/maintenance`,
      details: `Updated maintenance silence mode & namespace muting rules`,
      ip: req.ip
    });

    res.json(updatedConfig);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export const notificationsRouter = router;
