import { Router, Request, Response, NextFunction } from 'express';
import { ServiceMonitor } from '../services/ServiceMonitor';
import { requirePermission, getUserFromReq } from '../middleware/auth';
import { AuditLogService } from '../services/AuditLogService';
import { maskServiceEndpoint } from '../utils/sensitiveData';
import { RbacRoleService } from '../services/RbacRoleService';
import { withoutRawLogConfig } from '../utils/serviceVisibility';
import { startPollingStream } from '../utils/pollingStream';

const router = Router();
const monitor = ServiceMonitor.getInstance();
const auditLog = AuditLogService.getInstance();

const requireRawLogAccessWhenConfigured = (req: Request, res: Response, next: NextFunction) => {
  if (req.body?.logPath !== undefined || req.body?.logSources !== undefined) {
    return requirePermission('logs.raw.read')(req, res, next);
  }
  return next();
};

// Helper to mask sensitive connection strings for viewers
// GET /api/services - Get all services (with history limit)
router.get('/', requirePermission('services.read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const historyLimit = Number.parseInt(req.query.historyLimit as string) || 20;
    const canReadRawLogs = await RbacRoleService.hasPermission(req.user as any, 'logs.raw.read');
    const services = await Promise.all(monitor.getAllServices().map(async (service) => {
      const maskedService = await maskServiceEndpoint(service, req.user);
      return {
        ...(canReadRawLogs ? maskedService : withoutRawLogConfig(maskedService)),
        ...(canReadRawLogs ? { logPath: service.logPath, logSources: service.logSources } : {}),
        history: (service.history || []).slice(-historyLimit),
      };
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
router.get('/status', requirePermission('services.read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const canReadRawLogs = await RbacRoleService.hasPermission(req.user, 'logs.raw.read');
    const services = await Promise.all(monitor.getAllServices().map(async (service) => {
      const maskedService = await maskServiceEndpoint(service, req.user);
      const lastHistory =
        (service.history || []).length > 0 ? (service.history || [])[(service.history || []).length - 1] : null;

      return {
        name: maskedService.name,
        currentStatus: maskedService.currentStatus,
        endpoint: maskedService.endpoint, // Ensure masked endpoint is returned if needed by UI
        type: maskedService.type,
        ...(canReadRawLogs ? { logPath: service.logPath, logSources: service.logSources } : {}),
        lastCheck: lastHistory
          ? {
              timestamp: lastHistory.timestamp,
              responseTime: lastHistory.responseTime,
              success: lastHistory.success,
              status: lastHistory.status,
            }
          : null,
      };
    }));

    res.json({
      services,
      stats: monitor.getStats(),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/services/stream - Server-Sent Events for real-time updates
router.get('/stream', requirePermission('services.read'), async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Capture user from request closure
  const currentUser = req.user;
  const canReadRawLogs = await RbacRoleService.hasPermission(currentUser as any, 'logs.raw.read');

  // Send initial data
  const sendUpdate = async () => {
    const services = await Promise.all(monitor.getAllServices().map(async (service) => {
      const maskedService = await maskServiceEndpoint(service, currentUser);
      const lastHistory =
        (service.history || []).length > 0 ? (service.history || [])[(service.history || []).length - 1] : null;

      return {
        name: maskedService.name,
        currentStatus: maskedService.currentStatus,
        endpoint: maskedService.endpoint, // Ensure masked endpoint
        type: maskedService.type,
        ...(canReadRawLogs ? { logPath: service.logPath, logSources: service.logSources } : {}),
        lastCheck: lastHistory
          ? {
              timestamp: lastHistory.timestamp,
              responseTime: lastHistory.responseTime,
              success: lastHistory.success,
              status: lastHistory.status,
            }
          : null,
      };
    }));

    return `data: ${JSON.stringify({ services, stats: monitor.getStats() })}\n\n`;
  };

  startPollingStream(req, res, sendUpdate);
});

// GET /api/services/:name - Get specific service
router.get('/:name', requirePermission('services.read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.params;
    const service = monitor.getServiceByName(name as string);

    if (!service) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Service '${name}' not found`,
      });
    }

    const masked = await maskServiceEndpoint(service, req.user);
    if (await RbacRoleService.hasPermission(req.user as any, 'logs.raw.read')) {
      return res.json(masked);
    }
    return res.json(withoutRawLogConfig(masked));
  } catch (error) {
    next(error);
  }
});

// GET /api/services/:name/history - Get service history
router.get('/:name/history', requirePermission('services.read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.params;
    const limit = req.query.limit ? Number.parseInt(req.query.limit as string, 10) : undefined;

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
router.post('/:name/check', requirePermission('services.read'), async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/custom-check', requirePermission('services.manage'), async (req: Request, res: Response, next: NextFunction) => {
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
  requirePermission('services.manage'),
  requireRawLogAccessWhenConfigured,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, endpoint, headers, type, ignoreSSL, logPath, logSources, interval, retries } = req.body;

      if (!name || !endpoint) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Both name and endpoint are required',
        });
      }

      const newService = await monitor.addService({ name, endpoint, headers, type, ignoreSSL, logPath, logSources, interval, retries });
      auditLog.log({
        user: getUserFromReq(req),
        action: 'SERVICE_CREATE',
        target: `service/${newService.name}`,
        details: `Created service '${newService.name}' (${newService.type})`,
        ip: req.ip
      });
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
  requirePermission('services.manage'),
  requireRawLogAccessWhenConfigured,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name } = req.params;
      const { endpoint, headers, type, ignoreSSL, logPath, logSources, interval, retries } = req.body;

      if (!endpoint) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Endpoint is required',
        });
      }

      const updatedService = await monitor.updateService(name as string, { endpoint, headers, type, ignoreSSL, logPath, logSources, interval, retries });
      auditLog.log({
        user: getUserFromReq(req),
        action: 'SERVICE_UPDATE',
        target: `service/${name}`,
        details: `Updated parameters for service '${name}'`,
        ip: req.ip
      });
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
  requirePermission('services.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name } = req.params;

      await monitor.deleteService(name as string);
      auditLog.log({
        user: getUserFromReq(req),
        action: 'SERVICE_DELETE',
        target: `service/${name}`,
        details: `Deleted monitored service '${name}'`,
        ip: req.ip
      });
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
router.get('/status-page/config', requirePermission('services.read'), async (req: Request, res: Response, next: NextFunction) => {
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
  requirePermission('services.manage'),
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
