import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { KubiAccessService } from './KubiAccessService';
import { validateLicenseKey } from '../utils/licenseValidator';

jest.mock('../utils/licenseValidator', () => ({ validateLicenseKey: jest.fn() }));

const mockedLicenseValidator = validateLicenseKey as jest.MockedFunction<typeof validateLicenseKey>;
const originalEnv = { ...process.env };

describe('KubiAccessService', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, AI_KUBI_ENABLED: 'true', KUBIQ_LICENSE_KEY: 'test-license', AI_PROVIDER: 'gemini' };
    mockedLicenseValidator.mockResolvedValue(true);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetAllMocks();
  });

  it('fails closed when the configured AI provider key is absent', async () => {
    delete process.env.AI_API_KEY;

    await expect(KubiAccessService.getAvailability()).resolves.toMatchObject({
      enabled: true, proActive: true, providerConfigured: false, reason: 'AI_NOT_CONFIGURED',
    });
  });

  it('requires both a valid kubiq Pro license and a supported provider', async () => {
    process.env.AI_API_KEY = 'test-key';
    process.env.AI_PROVIDER = 'unsupported-provider';

    await expect(KubiAccessService.getAvailability()).resolves.toMatchObject({
      enabled: true, proActive: true, providerConfigured: false, reason: 'AI_NOT_CONFIGURED',
    });

    mockedLicenseValidator.mockResolvedValue(false);
    process.env.AI_PROVIDER = 'gemini';

    await expect(KubiAccessService.getAvailability()).resolves.toMatchObject({
      enabled: true, proActive: false, providerConfigured: true, reason: 'PRO_REQUIRED',
    });
  });
});
