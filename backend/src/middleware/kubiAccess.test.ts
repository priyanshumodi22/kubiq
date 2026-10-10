import { describe, expect, it, jest } from '@jest/globals';
import { requireKubiAccess } from './kubiAccess';
import { KubiAccessService } from '../services/KubiAccessService';

jest.mock('../services/KubiAccessService', () => ({ KubiAccessService: { getAvailability: jest.fn() } }));

const availability = KubiAccessService.getAvailability as jest.MockedFunction<typeof KubiAccessService.getAvailability>;

const response = () => {
  const json = jest.fn();
  return { status: jest.fn().mockReturnValue({ json }), json };
};

describe('requireKubiAccess', () => {
  it('allows the authenticated status check without exposing conversations', async () => {
    const next = jest.fn();
    await requireKubiAccess({ method: 'GET', path: '/status' } as any, response() as any, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(availability).not.toHaveBeenCalled();
  });

  it('fails closed with 402 when kubiq Pro is not active', async () => {
    availability.mockResolvedValue({ enabled: true, proActive: false, providerConfigured: true, provider: 'gemini', reason: 'PRO_REQUIRED' });
    const res = response();
    const next = jest.fn();

    await requireKubiAccess({ method: 'POST', path: '/conversations' } as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(next).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when the AI provider is missing', async () => {
    availability.mockResolvedValue({ enabled: true, proActive: true, providerConfigured: false, provider: 'gemini', reason: 'AI_NOT_CONFIGURED' });
    const res = response();

    await requireKubiAccess({ method: 'POST', path: '/conversations' } as any, res as any, jest.fn());

    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('allows a fully configured kubi request', async () => {
    availability.mockResolvedValue({ enabled: true, proActive: true, providerConfigured: true, provider: 'gemini' });
    const next = jest.fn();

    await requireKubiAccess({ method: 'POST', path: '/conversations' } as any, response() as any, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
