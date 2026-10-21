import { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';

const configuredToken = (): string =>
  (process.env.KUBIQ_INGESTION_TOKEN || process.env.INGESTION_TOKEN || '').trim();

const providedToken = (req: Request): string => {
  const authorization = req.get('authorization') || '';
  if (authorization.toLowerCase().startsWith('bearer ')) return authorization.slice(7).trim();
  return (req.get('x-kubiq-ingestion-token') || '').trim();
};

const tokensMatch = (expected: string, actual: string): boolean => {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
};

/**
 * Protects machine-to-machine ingestion. This deliberately has no insecure
 * fallback: accepting telemetry without a configured shared secret makes the
 * observability data writable by any reachable network client.
 */
export const requireIngestionAuth = (req: Request, res: Response, next: NextFunction): void => {
  const expected = configuredToken();
  if (!expected) {
    res.status(503).json({ error: 'INGESTION_AUTH_NOT_CONFIGURED', message: 'Telemetry ingestion is not configured.' });
    return;
  }

  if (!tokensMatch(expected, providedToken(req))) {
    res.status(401).json({ error: 'INGESTION_UNAUTHORIZED', message: 'A valid ingestion token is required.' });
    return;
  }

  next();
};
