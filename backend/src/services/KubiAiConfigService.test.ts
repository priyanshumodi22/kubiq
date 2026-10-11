import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { KubiAiConfigService } from './KubiAiConfigService';

jest.mock('../database/DatabaseFactory', () => ({
  DatabaseFactory: { getSystemRepository: jest.fn() },
}));

const getRepository = DatabaseFactory.getSystemRepository as jest.MockedFunction<typeof DatabaseFactory.getSystemRepository>;
const originalEnv = { ...process.env };
let stored: any = null;

describe('KubiAiConfigService', () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      KUBI_AI_CONFIG_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    };
    stored = null;
    getRepository.mockResolvedValue({
      getKubiAiConfig: jest.fn(async () => stored),
      saveKubiAiConfig: jest.fn(async (record) => { stored = record; }),
    } as any);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  it('encrypts a write-only administrator key and resolves it for provider use', async () => {
    await KubiAiConfigService.save({ provider: 'openai', model: 'gpt-4o-mini', apiKey: 'secret-value' });

    expect(stored.encryptedApiKey).not.toContain('secret-value');
    await expect(KubiAiConfigService.getPublicConfig()).resolves.toMatchObject({
      provider: 'openai', model: 'gpt-4o-mini', configured: true, managedInKubiq: true,
    });
    await expect(KubiAiConfigService.getResolvedConfig()).resolves.toMatchObject({ apiKey: 'secret-value' });
  });

  it('lets an administrator persist a model choice from the same-provider deployment bootstrap', async () => {
    process.env.AI_PROVIDER = 'gemini';
    process.env.AI_MODEL = 'gemini-2.5-flash';
    process.env.AI_API_KEY = 'bootstrap-key';

    await KubiAiConfigService.save({ provider: 'gemini', model: 'gemini-3.1-flash-lite' });

    expect(stored).toMatchObject({ provider: 'gemini', model: 'gemini-3.1-flash-lite' });
    expect(stored.encryptedApiKey).not.toContain('bootstrap-key');
    await expect(KubiAiConfigService.getResolvedConfig()).resolves.toMatchObject({
      provider: 'gemini', model: 'gemini-3.1-flash-lite', apiKey: 'bootstrap-key',
    });
  });

  it('requires a replacement key before an administrator switches providers', async () => {
    await KubiAiConfigService.save({ provider: 'gemini', model: 'gemini-3.1-flash-lite', apiKey: 'gemini-key' });

    await expect(KubiAiConfigService.save({ provider: 'openai', model: 'gpt-4o-mini' }))
      .rejects.toThrow('KUBI_API_KEY_REQUIRED');

    await expect(KubiAiConfigService.save({ provider: 'openai', model: 'gpt-4o-mini', apiKey: 'openai-key' }))
      .resolves.toMatchObject({ provider: 'openai', model: 'gpt-4o-mini', configured: true });
    await expect(KubiAiConfigService.getResolvedConfig()).resolves.toMatchObject({ provider: 'openai', apiKey: 'openai-key' });
  });

  it('fails closed when encryption is unavailable or a model is invalid', async () => {
    delete process.env.KUBI_AI_CONFIG_ENCRYPTION_KEY;
    await expect(KubiAiConfigService.save({ provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'key' }))
      .rejects.toThrow('KUBI_CONFIGURATION_ENCRYPTION_UNAVAILABLE');

    process.env.KUBI_AI_CONFIG_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    await expect(KubiAiConfigService.save({ provider: 'gemini', model: 'invalid model', apiKey: 'key' }))
      .rejects.toThrow('KUBI_MODEL_INVALID');
  });
});
