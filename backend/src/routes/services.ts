import { Router, Request, Response, NextFunction } from 'express';
import { ServiceMonitor } from '../services/ServiceMonitor';
import { requireRole } from '../middleware/auth';

const router = Router();
const monitor = ServiceMonitor.getInstance();

// GET /api/services - Get all services (with history limit)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const historyLimit = parseInt(req.query.historyLimit as string) || 20;
    const services = monitor.getAllServices().map((service) => ({
      ...service,
      history: service.history.slice(-historyLimit),
    }));

    res.json({
      services,
      stats: monitor.getStats(),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/services/status - Get lightweight status only (no history)
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const services = monitor.getAllServices().map((service) => {
      const lastHistory =
        service.history.length > 0 ? service.history[service.history.length - 1] : null;

      return {
        name: service.name,
        currentStatus: service.currentStatus,
        lastCheck: lastHistory
          ? {
              timestamp: lastHistory.timestamp,
              responseTime: lastHistory.responseTime,
              success: lastHistory.success,
              status: lastHistory.status,
            }
          : null,
      };
    });

    res.json({
      services,
      stats: monitor.getStats(),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/services/stream - Server-Sent Events for real-time updates
router.get('/stream', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send initial data
  const sendUpdate = () => {
    const services = monitor.getAllServices().map((service) => {
      const lastHistory =
        service.history.length > 0 ? service.history[service.history.length - 1] : null;

      return {
        name: service.name,
        currentStatus: service.currentStatus,
        lastCheck: lastHistory
          ? {
              timestamp: lastHistory.timestamp,
              responseTime: lastHistory.responseTime,
              success: lastHistory.success,
              status: lastHistory.status,
            }
          : null,
      };
    });

    res.write(`data: ${JSON.stringify({ services, stats: monitor.getStats() })}\n\n`);
  };

  // Send updates every 5 seconds
  sendUpdate();
  const interval = setInterval(sendUpdate, 5000);

  // Cleanup on connection close
  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

// GET /api/services/:name - Get specific service
router.get('/:name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.params;
    const service = monitor.getServiceByName(name as string);

    if (!service) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Service '${name}' not found`,
      });
    }

    res.json(service);
  } catch (error) {
    next(error);
  }
});

// GET /api/services/:name/history - Get service history
router.get('/:name/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

    const service = monitor.getServiceByName(name as string);
    if (!service) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Service '${name}' not found`,
      });
    }

    const history = await monitor.getServiceHistory(name as string, limit);
    res.json({
      name,
      history,
      count: history.length,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/services/:name/check - Trigger manual health check
router.post('/:name/check', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.params;

    const service = monitor.getServiceByName(name as string);
    if (!service) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Service '${name}' not found`,
      });
    }

    const result = await monitor.checkServiceHealth(name as string);
    res.json({
      name,
      result,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/services/custom-check - Custom endpoint check
router.post('/custom-check', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { service, endpoint, method, headers, body } = req.body;

    if (!service || !endpoint) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Both service and endpoint are required',
      });
    }

    console.log(
      `🔍 Custom endpoint check: Service="${service}", Endpoint="${endpoint}", Method="${
        method || 'GET'
      }"`
    );

    const result = await monitor.customEndpointCheck(service, endpoint, method, headers, body);

    console.log(
      `✅ Custom check result: Status=${result.status}, ResponseTime=${result.responseTime}ms`
    );

    res.json(result);
  } catch (error) {
    console.error(
      `❌ Custom endpoint check failed: Service="${req.body?.service}", Endpoint="${req.body?.endpoint}"`,
      error
    );
    next(error);
  }
});

// POST /api/services - Create new service (admin only)
router.post(
  '/',
  requireRole('kubiq-admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, endpoint, headers } = req.body;

      if (!name || !endpoint) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Both name and endpoint are required',
        });
      }

      const newService = await monitor.addService({ name, endpoint, headers });
      res.status(201).json({
        message: 'Service created successfully',
        service: newService,
      });
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        return res.status(409).json({
          error: 'Conflict',
          message: error.message,
        });
      }
      next(error);
    }
  }
);

// PUT /api/services/:name - Update service (admin only)
router.put(
  '/:name',
  requireRole('kubiq-admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name } = req.params;
      const { endpoint, headers } = req.body;

      if (!endpoint) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Endpoint is required',
        });
      }

      const updatedService = await monitor.updateService(name as string, { endpoint, headers });
      res.json({
        message: 'Service updated successfully',
        service: updatedService,
      });
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        return res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
      }
      next(error);
    }
  }
);

// DELETE /api/services/:name - Delete service (admin only)
router.delete(
  '/:name',
  requireRole('kubiq-admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name } = req.params;

      await monitor.deleteService(name as string);
      res.json({
        message: `Service '${name}' deleted successfully`,
      });
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        return res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
      }
      next(error);
    }
  }
);

// GET /api/services/status-page/config - Get config (Admin/Auth)
router.get('/status-page/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = monitor.getStatusPageConfig();
    res.json(config);
  } catch (error) {
    next(error);
  }
});

// PUT /api/services/status-page/config - Update config (Admin only)
router.put(
  '/status-page/config',
  requireRole('kubiq-admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slug, title, refreshInterval } = req.body;
      const config = await monitor.updateStatusPageConfig({ slug, dashboardTitle: title, refreshInterval });
      res.json(config);
    } catch (error) {
      next(error);
    }
  }
);

export { router as servicesRouter };
