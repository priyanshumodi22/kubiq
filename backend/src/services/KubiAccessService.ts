import { validateLicenseKey } from '../utils/licenseValidator';

export type KubiAvailability = {
  enabled: boolean;
  proActive: boolean;
  providerConfigured: boolean;
  provider: string | null;
  reason?: 'DISABLED' | 'PRO_REQUIRED' | 'AI_NOT_CONFIGURED';
};

export class KubiAccessService {
  static async getAvailability(): Promise<KubiAvailability> {
    const enabled = process.env.AI_KUBI_ENABLED === 'true';
    const licenseKey = process.env.KUBIQ_LICENSE_KEY?.trim() || '';
    const proActive = Boolean(licenseKey) && await validateLicenseKey(licenseKey);
    const provider = (process.env.AI_PROVIDER || '').toLowerCase();
    const providerConfigured = ['gemini', 'openai', 'anthropic'].includes(provider) && Boolean(process.env.AI_API_KEY?.trim());

    if (!enabled) return { enabled, proActive, providerConfigured, provider: provider || null, reason: 'DISABLED' };
    if (!proActive) return { enabled, proActive, providerConfigured, provider: provider || null, reason: 'PRO_REQUIRED' };
    if (!providerConfigured) return { enabled, proActive, providerConfigured, provider: provider || null, reason: 'AI_NOT_CONFIGURED' };
    return { enabled, proActive, providerConfigured, provider };
  }
}
