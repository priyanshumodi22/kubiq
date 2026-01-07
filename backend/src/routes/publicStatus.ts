import { Router, Request, Response } from 'express';
import { ServiceMonitor } from '../services/ServiceMonitor';

const router = Router();
const monitor = ServiceMonitor.getInstance();

// GET /api/public/status-page/:slug
router.get('/status-page/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const config = monitor.getStatusPageConfig();

    // 1. Check if status page is enabled (slug is not null)
    if (!config.slug) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Status page is not configured.',
      });
    }

    // 2. Check if slug matches
    if (config.slug !== slug) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Status page not found.',
      });
    }

    // 3. Return public data
    // We filter out sensitive service details if necessary, but for now we send what's needed for visualization
    const services = monitor.getAllServices().map((s) => ({
      name: s.name,
      currentStatus: s.currentStatus,
      // We send full history for the "timeline blocks"
      history: s.history, 
      // Omit headers/endpoints as they might be sensitive? 
      // User didn't explicitly safeguard, but it's good practice.
      // However, frontend might need them? No, just status.
    }));

    res.json({
      pageTitle: config.title,
      refreshInterval: config.refreshInterval,
      services,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error serving status page:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export { router as publicStatusRouter };
