import axios from 'axios';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Readable } from 'stream';
import { KubiProviderService } from './KubiProviderService';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;
const originalEnv = { ...process.env };
const messages = [{ role: 'user' as const, content: 'What is unhealthy?' }];

describe('KubiProviderService', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  it.each([
    ['openai', { data: { choices: [{ message: { content: 'OpenAI answer' } }] } }, 'OpenAI answer'],
    ['anthropic', { data: { content: [{ text: 'Anthropic answer' }] } }, 'Anthropic answer'],
    ['gemini', { data: { candidates: [{ content: { parts: [{ text: 'Gemini answer' }] } }] } }, 'Gemini answer'],
  ])('returns a normalized %s response', async (provider, response, expected) => {
    process.env = { ...originalEnv, AI_PROVIDER: provider, AI_API_KEY: 'test-key', AI_KUBI_TIMEOUT_MS: '1500' };
    mockedAxios.post.mockResolvedValue(response as any);

    await expect(new KubiProviderService().complete(messages)).resolves.toBe(expected);
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('fails closed when no key or unsupported provider is configured', async () => {
    process.env = { ...originalEnv, AI_PROVIDER: 'gemini' };
    await expect(new KubiProviderService().complete(messages)).rejects.toThrow('AI_NOT_CONFIGURED');

    process.env = { ...originalEnv, AI_PROVIDER: 'unsupported', AI_API_KEY: 'test-key' };
    await expect(new KubiProviderService().complete(messages)).rejects.toThrow('AI_PROVIDER_UNSUPPORTED');
  });

  it('forwards OpenAI provider-native SSE deltas as they arrive', async () => {
    process.env = { ...originalEnv, AI_PROVIDER: 'openai', AI_API_KEY: 'test-key' };
    mockedAxios.post.mockResolvedValue({
      data: Readable.from([
        'data: {"choices":[{"delta":{"content":"Healthy "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"services"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    } as any);
    const deltas: string[] = [];

    await expect(new KubiProviderService().stream(messages, delta => deltas.push(delta))).resolves.toBe('Healthy services');
    expect(deltas).toEqual(['Healthy ', 'services']);
  });
});
