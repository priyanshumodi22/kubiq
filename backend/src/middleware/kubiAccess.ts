import { Request, Response, NextFunction } from 'express';
import { KubiAccessService } from '../services/KubiAccessService';

function unavailableResponse(reason: string): { status: number; message: string } {
  if (reason === 'PRO_REQUIRED') return { status: 402, message: 'kubi is available with an active kubiq Pro license.' };
  if (reason === 'AI_NOT_CONFIGURED') return { status: 503, message: 'kubi needs a supported AI provider and AI_API_KEY configuration.' };
  return { status: 404, message: 'kubi is disabled for this deployment.' };
}

export const requireKubiAccess = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (_req.method === 'GET' && _req.path === '/status') return next();
    const availability = await KubiAccessService.getAvailability();
    if (!availability.reason) return next();

    const { status, message } = unavailableResponse(availability.reason);
    return res.status(status).json({ error: availability.reason, message });
  } catch {
    return res.status(503).json({ error: 'KUBI_UNAVAILABLE', message: 'kubi is temporarily unavailable.' });
  }
};
