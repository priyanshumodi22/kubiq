import axios from 'axios';
import { KubiAiConfigService } from './KubiAiConfigService';

export type KubiPromptMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export class KubiProviderService {
  async complete(messages: KubiPromptMessage[], maxTokens = 1200): Promise<string> {
    const config = await KubiAiConfigService.getResolvedConfig();
    const apiKey = config?.apiKey;
    const provider = config?.provider;
    const model = config?.model;
    const timeout = Math.max(1_000, Math.min(Number(process.env.AI_KUBI_TIMEOUT_MS) || 60_000, 120_000));
    if (!apiKey) throw new Error('AI_NOT_CONFIGURED');

    if (provider === 'openai') {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model, messages, max_tokens: maxTokens,
      }, { timeout, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } });
      return response.data?.choices?.[0]?.message?.content?.trim() || '';
    }

    if (provider === 'anthropic') {
      const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n');
      const response = await axios.post('https://api.anthropic.com/v1/messages', {
        model, max_tokens: maxTokens, system,
        messages: messages.filter(message => message.role !== 'system').map(message => ({ role: message.role, content: message.content })),
      }, { timeout, headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } });
      return response.data?.content?.[0]?.text?.trim() || '';
    }

    if (provider === 'gemini') {
      const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n');
      const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents: messages.filter(message => message.role !== 'system').map(message => ({
          role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }],
        })),
        generationConfig: { maxOutputTokens: maxTokens },
      }, { timeout, headers: { 'Content-Type': 'application/json' } });
      return response.data?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('').trim() || '';
    }

    throw new Error('AI_PROVIDER_UNSUPPORTED');
  }

  async stream(messages: KubiPromptMessage[], onDelta: (delta: string) => void, maxTokens = 1200): Promise<string> {
    const config = await KubiAiConfigService.getResolvedConfig();
    const apiKey = config?.apiKey;
    const provider = config?.provider;
    const model = config?.model;
    const timeout = Math.max(1_000, Math.min(Number(process.env.AI_KUBI_TIMEOUT_MS) || 60_000, 120_000));
    if (!apiKey) throw new Error('AI_NOT_CONFIGURED');

    if (provider === 'openai') {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model, messages, max_tokens: maxTokens, stream: true,
      }, { timeout, responseType: 'stream', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } });
      return this.consumeSse(response.data, (data) => data === '[DONE]' ? null : JSON.parse(data)?.choices?.[0]?.delta?.content || '', onDelta);
    }

    if (provider === 'anthropic') {
      const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n');
      const response = await axios.post('https://api.anthropic.com/v1/messages', {
        model, max_tokens: maxTokens, system, stream: true,
        messages: messages.filter(message => message.role !== 'system').map(message => ({ role: message.role, content: message.content })),
      }, { timeout, responseType: 'stream', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } });
      return this.consumeSse(response.data, (data) => JSON.parse(data)?.delta?.text || '', onDelta);
    }

    if (provider === 'gemini') {
      const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n');
      const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`, {
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents: messages.filter(message => message.role !== 'system').map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })),
        generationConfig: { maxOutputTokens: maxTokens },
      }, { timeout, responseType: 'stream', headers: { 'Content-Type': 'application/json' } });
      return this.consumeSse(response.data, (data) => JSON.parse(data)?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '', onDelta);
    }

    throw new Error('AI_PROVIDER_UNSUPPORTED');
  }

  private async consumeSse(stream: AsyncIterable<Buffer | string>, parseDelta: (data: string) => string | null, onDelta: (delta: string) => void): Promise<string> {
    let buffer = '';
    let answer = '';
    for await (const chunk of stream) {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const delta = parseDelta(line.slice(5).trim());
        if (!delta) continue;
        answer += delta;
        onDelta(delta);
      }
    }
    return answer.trim();
  }
}
