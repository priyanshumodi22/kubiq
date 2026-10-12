import { getNativeJwtSecret, NativeJwtConfigurationError } from './nativeJwt';
import { afterEach, describe, expect, it } from '@jest/globals';

describe('Native JWT configuration', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses an explicit secret in production', () => {
    process.env = { ...originalEnv, NODE_ENV: 'production', JWT_SECRET: 'a-production-secret' };
    expect(getNativeJwtSecret()).toBe('a-production-secret');
  });

  it('rejects the known fallback secret in production', () => {
    process.env = { ...originalEnv, NODE_ENV: 'production' };
    delete process.env.JWT_SECRET;
    expect(() => getNativeJwtSecret()).toThrow(NativeJwtConfigurationError);
  });

  it('retains the deterministic fallback for local development', () => {
    process.env = { ...originalEnv, NODE_ENV: 'test' };
    delete process.env.JWT_SECRET;
    expect(getNativeJwtSecret()).toBe('dev-secret-do-not-use-in-prod');
  });
});
