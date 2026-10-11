import { validateLicenseKey } from '../utils/licenseValidator';
import { KubiAiConfigService } from './KubiAiConfigService';

export type KubiAvailability = {
  enabled: boolean;
  proActive: boolean;
  providerConfigured: boolean;
  provider: string | null;
  model?: string | null;
  reason?: 'DISABLED' | 'PRO_REQUIRED' | 'AI_NOT_CONFIGURED';
};

export class KubiAccessService {
  static async getAvailability(): Promise<KubiAvailability> {
    const enabled = process.env.AI_KUBI_ENABLED === 'true';
    const licenseKey = process.env.KUBIQ_LICENSE_KEY?.trim() || '';
    const proActive = Boolean(licenseKey) && await validateLicenseKey(licenseKey);
    const aiConfig = await KubiAiConfigService.getPublicConfig();
    const provider = aiConfig.provider;
    const providerConfigured = aiConfig.configured;

    if (!enabled) return { enabled, proActive, providerConfigured, provider, model: aiConfig.model, reason: 'DISABLED' };
    if (!proActive) return { enabled, proActive, providerConfigured, provider, model: aiConfig.model, reason: 'PRO_REQUIRED' };
    if (!providerConfigured) return { enabled, proActive, providerConfigured, provider, model: aiConfig.model, reason: 'AI_NOT_CONFIGURED' };
    return { enabled, proActive, providerConfigured, provider, model: aiConfig.model };
  }
}
