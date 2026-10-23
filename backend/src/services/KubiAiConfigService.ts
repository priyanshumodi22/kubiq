import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { DatabaseFactory } from '../database/DatabaseFactory';
import type { KubiAiConfigRecord } from '../database/interfaces/ISystemRepository';

export type KubiProvider = 'gemini' | 'openai' | 'anthropic';
export type KubiAiPublicConfig = {
  provider: KubiProvider | null;
  model: string | null;
  configured: boolean;
  managedInKubiq: boolean;
  encryptionReady: boolean;
};
export type KubiAiResolvedConfig = { provider: KubiProvider; model: string; apiKey: string };

const providers = new Set<KubiProvider>(['gemini', 'openai', 'anthropic']);
const modelPattern = /^[A-Za-z0-9._:-]{2,128}$/;

export class KubiAiConfigService {
  private static key(): Buffer | null {
    const raw = process.env.KUBI_AI_CONFIG_ENCRYPTION_KEY?.trim();
    if (!raw) return null;
    try {
      const key = Buffer.from(raw, 'base64');
      return key.length === 32 ? key : null;
    } catch { return null; }
  }

  private static validate(provider: unknown, model: unknown): { provider: KubiProvider; model: string } {
    const normalizedProvider = (typeof provider === 'string' ? provider.toLowerCase() : '') as KubiProvider;
    const normalizedModel = typeof model === 'string' ? model.trim() : '';
    if (!providers.has(normalizedProvider)) throw new Error('KUBI_PROVIDER_INVALID');
    if (!modelPattern.test(normalizedModel)) throw new Error('KUBI_MODEL_INVALID');
    return { provider: normalizedProvider, model: normalizedModel };
  }

  private static encrypt(value: string): string {
    const key = this.key();
    if (!key) throw new Error('KUBI_CONFIGURATION_ENCRYPTION_UNAVAILABLE');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
  }

  private static decrypt(value: string): string | null {
    const key = this.key();
    if (!key) return null;
    const [ivPart, tagPart, dataPart] = value.split('.');
    if (!ivPart || !tagPart || !dataPart) return null;
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64url')), decipher.final()]).toString('utf8');
    } catch { return null; }
  }

  private static environmentConfig(): KubiAiResolvedConfig | null {
    try {
      const { provider, model } = this.validate(process.env.AI_PROVIDER, process.env.AI_MODEL);
      const apiKey = process.env.AI_API_KEY?.trim();
      return apiKey ? { provider, model, apiKey } : null;
    } catch { return null; }
  }

  static async getResolvedConfig(): Promise<KubiAiResolvedConfig | null> {
    const key = this.key();
    if (key) {
      const record = await (await DatabaseFactory.getSystemRepository()).getKubiAiConfig();
      if (record) {
        const { provider, model } = this.validate(record.provider, record.model);
        const apiKey = this.decrypt(record.encryptedApiKey)?.trim();
        if (apiKey) return { provider, model, apiKey };
      }
    }
    return this.environmentConfig();
  }

  static async getPublicConfig(): Promise<KubiAiPublicConfig> {
    const key = this.key();
    const record = key ? await (await DatabaseFactory.getSystemRepository()).getKubiAiConfig() : null;
    if (record) {
      try {
        const { provider, model } = this.validate(record.provider, record.model);
        return { provider, model, configured: Boolean(this.decrypt(record.encryptedApiKey)), managedInKubiq: true, encryptionReady: true };
      } catch {
        return { provider: null, model: null, configured: false, managedInKubiq: true, encryptionReady: true };
      }
    }
    const resolved = this.environmentConfig();
    return { provider: resolved?.provider || null, model: resolved?.model || null, configured: Boolean(resolved), managedInKubiq: false, encryptionReady: Boolean(key) };
  }

  static async save(input: { provider: unknown; model: unknown; apiKey?: unknown }): Promise<KubiAiPublicConfig> {
    if (!this.key()) throw new Error('KUBI_CONFIGURATION_ENCRYPTION_UNAVAILABLE');
    const { provider, model } = this.validate(input.provider, input.model);
    const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
    const repository = await DatabaseFactory.getSystemRepository();
    const existing = await repository.getKubiAiConfig();
    // A deployment may provide an initial provider/key for a fresh install. An
    // administrator should be able to select a new model for that same provider
    // from the kubiq UI without having to re-enter a key that is already present
    // in the runtime environment. The selected value is then persisted encrypted.
    const bootstrap = !apiKey && !existing ? this.environmentConfig() : null;
    // A stored key belongs only to its provider. Reusing it after the admin
    // switches providers would both fail and conceal a configuration mistake.
    if (!apiKey && existing && existing.provider !== provider) {
      throw new Error('KUBI_API_KEY_REQUIRED');
    }
    if (!apiKey && !existing && bootstrap?.provider !== provider) {
      throw new Error('KUBI_API_KEY_REQUIRED');
    }
    const encryptedApiKey = apiKey
      ? this.encrypt(apiKey)
      : existing?.encryptedApiKey || this.encrypt(bootstrap!.apiKey);
    await repository.saveKubiAiConfig({ provider, model, encryptedApiKey, updatedAt: Date.now() } satisfies KubiAiConfigRecord);
    return this.getPublicConfig();
  }
}
