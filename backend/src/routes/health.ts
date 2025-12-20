import { Router, Request, Response } from 'express';
import { ServiceMonitor } from '../services/ServiceMonitor';

const router = Router();

// GET /api/health - Dashboard health check
router.get('/', (req: Request, res: Response) => {
  const monitor = ServiceMonitor.getInstance();
  const stats = monitor.getStats();

  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    uptime: process.uptime(),
    monitoring: stats,
  });
});

export { router as healthRouter };
