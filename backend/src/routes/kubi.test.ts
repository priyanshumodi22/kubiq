import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const repository = {
  createConversation: jest.fn<any>(), listConversations: jest.fn<any>(), getConversation: jest.fn<any>(), appendMessage: jest.fn<any>(), deleteConversation: jest.fn<any>(), clearConversations: jest.fn<any>(),
};
const stream = jest.fn<any>();
const plan = jest.fn<any>();
jest.mock('../services/KubiIntentService', () => ({ KubiIntentService: jest.fn().mockImplementation(() => ({ plan })) }));

jest.mock('../database/DatabaseFactory', () => ({ DatabaseFactory: { getKubiConversationRepository: jest.fn(async () => repository) } }));
jest.mock('../services/KubiAccessService', () => ({ KubiAccessService: { getAvailability: jest.fn() } }));
jest.mock('../services/KubiService', () => ({
  KubiService: jest.fn().mockImplementation(() => ({ getRequestContext: jest.fn(() => ({ user: {}, username: 'user-a', k8sContext: '' })), stream })),
  kubiMessage: jest.fn((role: 'user' | 'assistant', content: string, evidence?: unknown[]) => ({ id: `${role}-message`, role, content, createdAt: new Date().toISOString(), ...(evidence?.length ? { evidence } : {}) })),
}));
jest.mock('../services/AuditLogService', () => ({ AuditLogService: { getInstance: jest.fn(() => ({ log: jest.fn() })) } }));
jest.mock('../middleware/auth', () => ({ getUserFromReq: jest.fn(() => 'user-a') }));

import { kubiRouter } from './kubi';

const messageHandler = (kubiRouter as any).stack.find((layer: any) => layer.route?.path === '/conversations/:conversationId/messages').route.stack[0].handle;

describe('kubi streaming message route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    repository.getConversation.mockResolvedValue({ id: 'conversation-a', userId: 'user-a', messages: [] });
    repository.appendMessage.mockResolvedValue({ id: 'conversation-a' });
    plan.mockResolvedValue({ kind: 'answer', question: 'Which services are unhealthy?', domains: ['services'], options: [], message: '' });
    stream.mockImplementation(async (_question: string, _history: unknown[], _context: unknown, onDelta: (delta: string) => void, onState: (state: string) => void) => {
      onState('searching');
      onState('working');
      onState('composing');
      onDelta('Healthy ');
      onDelta('services');
      return { answer: 'Healthy services', evidence: [{ type: 'service', label: 'Service health', href: '/dashboard?tab=services' }] };
    });
  });

  it('persists the question and answer while sending provider-native SSE deltas', async () => {
    const writes: string[] = [];
    const req = { user: { sub: 'user-a' }, params: { conversationId: 'conversation-a' }, body: { message: 'Which services are unhealthy?' }, headers: {}, ip: '127.0.0.1' };
    const res = {
      setHeader: jest.fn(), flushHeaders: jest.fn(), write: jest.fn((value: string) => writes.push(value)), end: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn(),
    };

    await messageHandler(req, res);

    expect(repository.appendMessage).toHaveBeenCalledTimes(2);
    expect(writes.join('')).toContain('event: answer_delta');
    expect(writes.join('')).toContain('"text":"Healthy "');
    expect(writes.join('')).toContain('"text":"services"');
    expect(writes.join('')).toContain('event: evidence');
    expect(writes.join('')).toContain('event: done');
    const events = writes.join('');
    expect(events.indexOf('"state":"thinking"')).toBeLessThan(events.indexOf('"state":"searching"'));
    expect(events.indexOf('"state":"searching"')).toBeLessThan(events.indexOf('"state":"working"'));
    expect(events.indexOf('"state":"working"')).toBeLessThan(events.indexOf('"state":"composing"'));
    expect(events.indexOf('"state":"composing"')).toBeLessThan(events.indexOf('event: answer_delta'));
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  it('declines an unrelated question locally without calling the AI provider', async () => {
    plan.mockResolvedValue({ kind: 'refuse', message: 'I can help with kubiq, but not unrelated coding.', domains: [], options: [] });
    const writes: string[] = [];
    const req = { user: { sub: 'user-a' }, params: { conversationId: 'conversation-a' }, body: { message: 'Write a React login page' }, headers: {}, ip: '127.0.0.1' };
    const res = { setHeader: jest.fn(), flushHeaders: jest.fn(), write: jest.fn((value: string) => writes.push(value)), end: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };

    await messageHandler(req, res);

    expect(stream).not.toHaveBeenCalled();
    expect(repository.appendMessage).toHaveBeenCalledTimes(2);
    expect(writes.join('')).toContain("I can help with kubiq");
    expect(writes.join('')).toContain('event: done');
  });
  it('persists clarification choices without collecting telemetry', async () => {
    plan.mockResolvedValue({ kind: 'clarify', message: 'Whose history?', options: ['My account', 'All users'], domains: [] });
    const writes: string[] = [];
    const res = { setHeader: jest.fn(), flushHeaders: jest.fn(), write: jest.fn((value: string) => writes.push(value)), end: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
    await messageHandler({ user: { sub: 'user-a' }, params: { conversationId: 'conversation-a' }, body: { message: 'Who updated user access?' }, headers: {} }, res);
    expect(stream).not.toHaveBeenCalled();
    expect(repository.appendMessage).toHaveBeenLastCalledWith('user-a', 'conversation-a', expect.objectContaining({ clarification: { options: ['My account', 'All users'] } }));
    expect(writes.join('')).not.toContain('"state":"searching"');
  });
  it('reports provider quota failures without exposing provider response details', async () => {
    plan.mockRejectedValue({ response: { status: 429, data: 'private provider diagnostics' } });
    const logger = jest.spyOn(console, 'error').mockImplementation(() => {});
    const writes: string[] = [];
    const res = { setHeader: jest.fn(), flushHeaders: jest.fn(), write: jest.fn((value: string) => writes.push(value)), end: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
    try {
      await messageHandler({ user: { sub: 'user-a' }, params: { conversationId: 'conversation-a' }, body: { message: 'Investigate my service' }, headers: {} }, res);
      expect(writes.join('')).toContain('KUBI_PROVIDER_RATE_LIMITED');
      expect(writes.join('')).not.toContain('private provider diagnostics');
      expect(stream).not.toHaveBeenCalled();
    } finally { logger.mockRestore(); }
  });
});
