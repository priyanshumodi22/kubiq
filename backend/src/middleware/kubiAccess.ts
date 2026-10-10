import { Request, Response, NextFunction } from 'express';
import { KubiAccessService } from '../services/KubiAccessService';

export const requireKubiAccess = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (_req.method === 'GET' && _req.path === '/status') return next();
    const availability = await KubiAccessService.getAvailability();
    if (!availability.reason) return next();

    const status = availability.reason === 'PRO_REQUIRED' ? 402 : availability.reason === 'AI_NOT_CONFIGURED' ? 503 : 404;
    return res.status(status).json({ error: availability.reason, message: availability.reason === 'PRO_REQUIRED'
      ? 'kubi is available with an active kubiq Pro license.'
      : availability.reason === 'AI_NOT_CONFIGURED'
        ? 'kubi needs a supported AI provider and AI_API_KEY configuration.'
        : 'kubi is disabled for this deployment.' });
  } catch {
    return res.status(503).json({ error: 'KUBI_UNAVAILABLE', message: 'kubi is temporarily unavailable.' });
  }
};
