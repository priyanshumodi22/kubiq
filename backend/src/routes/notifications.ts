import express from 'express';
import { NotificationManager } from '../services/NotificationManager';
import { NotificationChannel } from '../types';

const router = express.Router();
const notificationManager = NotificationManager.getInstance();

// GET /api/notifications - List all channels
router.get('/', (req, res) => {
  try {
    const channels = notificationManager.getChannels();
    res.json(channels);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/notifications - Create a channel
router.post('/', async (req, res) => {
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

    res.status(201).json(newChannel);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/notifications/:id - Update a channel
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updatedChannel = await notificationManager.updateChannel(id, updates);
    res.json(updatedChannel);
  } catch (error: any) {
    if (error.message === 'Channel not found') {
      res.status(404).json({ message: 'Channel not found' });
    } else {
      res.status(500).json({ message: error.message });
    }
  }
});

// DELETE /api/notifications/:id - Delete a channel
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await notificationManager.deleteChannel(id);
    res.json({ message: 'Channel deleted' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/notifications/:id/test - Test a channel
router.post('/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    await notificationManager.sendTest(id);
    res.json({ message: 'Test notification sent' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export const notificationsRouter = router;
