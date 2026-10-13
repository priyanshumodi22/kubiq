import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { requireIngestionAuth } from './ingestionAuth';

const response = () => {
  const result: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  return result;
};

describe('requireIngestionAuth', () => {
  const original = process.env.KUBIQ_INGESTION_TOKEN;

  afterEach(() => {
    if (original === undefined) delete process.env.KUBIQ_INGESTION_TOKEN;
    else process.env.KUBIQ_INGESTION_TOKEN = original;
  });

  it('rejects missing and invalid bearer tokens', () => {
    process.env.KUBIQ_INGESTION_TOKEN = 'ingestion-secret';
    for (const authorization of ['', 'Bearer incorrect']) {
      const res = response();
      const next = jest.fn();
      requireIngestionAuth({ get: (name: string) => name === 'authorization' ? authorization : undefined } as any, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('accepts the standard Authorization bearer header', () => {
    process.env.KUBIQ_INGESTION_TOKEN = 'ingestion-secret';
    const next = jest.fn();
    requireIngestionAuth({ get: (name: string) => name === 'authorization' ? 'Bearer ingestion-secret' : undefined } as any, response(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
