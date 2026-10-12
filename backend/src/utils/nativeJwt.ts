const DEVELOPMENT_SECRET = 'dev-secret-do-not-use-in-prod';

export class NativeJwtConfigurationError extends Error {
  constructor() {
    super('JWT_SECRET must be configured when Native authentication is enabled in production.');
    this.name = 'NativeJwtConfigurationError';
  }
}

/**
 * Native tokens must never silently use a known development secret in a
 * production deployment. Local test and development environments retain the
 * deterministic fallback so the self-hosted quick-start remains usable.
 */
export const getNativeJwtSecret = (): string => {
  const configured = process.env.JWT_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') throw new NativeJwtConfigurationError();
  return DEVELOPMENT_SECRET;
};

export const isNativeJwtConfigurationError = (error: unknown): error is NativeJwtConfigurationError =>
  error instanceof NativeJwtConfigurationError;
