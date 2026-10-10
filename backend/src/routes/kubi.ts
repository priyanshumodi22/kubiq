import { Router, Request, Response } from 'express';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { KubiAccessService } from '../services/KubiAccessService';
import { KubiService, kubiMessage } from '../services/KubiService';
import { sanitizeKubiContent } from '../utils/kubiSanitizer';
import { AuditLogService } from '../services/AuditLogService';
import { getUserFromReq } from '../middleware/auth';
import { KubiScopeService } from '../services/KubiScopeService';
import { KubiIntentService } from '../services/KubiIntentService';

export const kubiRouter = Router();
const kubiService = new KubiService();
const auditLog = AuditLogService.getInstance();
const activeUsers = new Set<string>();
const requestTimestamps = new Map<string, number[]>();

const getUserId = (req: Request) => String((req.user as any)?.sub || (req.user as any)?.id || getUserFromReq(req));
const sanitizeInput = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 4000) : '';
const sendEvent = (res: Response, event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

const consumeRequestAllowance = (userId: string): boolean => {
  const now = Date.now();
  const limit = Math.max(1, Math.min(Number(process.env.AI_KUBI_MAX_REQUESTS_PER_HOUR) || 30, 120));
  const requests = (requestTimestamps.get(userId) || []).filter(timestamp => timestamp > now - 60 * 60 * 1000);
  if (requests.length >= limit) {
    requestTimestamps.set(userId, requests);
    return false;
  }
  requests.push(now);
  requestTimestamps.set(userId, requests);
  return true;
};

kubiRouter.get('/status', async (_req, res) => {
  const availability = await KubiAccessService.getAvailability();
  res.json(availability);
});

kubiRouter.post('/conversations', async (req, res) => {
  const userId = getUserId(req);
  const title = sanitizeInput(req.body?.title) || undefined;
  const repository = await DatabaseFactory.getKubiConversationRepository();
  const conversation = await repository.createConversation(userId, title);
  res.status(201).json(conversation);
});

kubiRouter.get('/conversations', async (req, res) => {
  const repository = await DatabaseFactory.getKubiConversationRepository();
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 100));
  const conversations = await repository.listConversations(getUserId(req), limit);
  res.json(conversations);
});

kubiRouter.get('/conversations/:conversationId', async (req, res) => {
  const repository = await DatabaseFactory.getKubiConversationRepository();
  const conversation = await repository.getConversation(getUserId(req), String(req.params.conversationId));
  if (!conversation) return res.status(404).json({ error: 'KUBI_CONVERSATION_NOT_FOUND' });
  return res.json(conversation);
});

kubiRouter.delete('/conversations/:conversationId', async (req, res) => {
  const repository = await DatabaseFactory.getKubiConversationRepository();
  const deleted = await repository.deleteConversation(getUserId(req), String(req.params.conversationId));
  if (!deleted) return res.status(404).json({ error: 'KUBI_CONVERSATION_NOT_FOUND' });
  return res.status(204).end();
});

kubiRouter.delete('/conversations', async (req, res) => {
  const repository = await DatabaseFactory.getKubiConversationRepository();
  const deleted = await repository.clearConversations(getUserId(req));
  res.json({ deleted });
});

kubiRouter.post('/conversations/:conversationId/messages', async (req, res) => {
  const userId = getUserId(req);
  if (activeUsers.has(userId)) return res.status(429).json({ error: 'KUBI_REQUEST_ACTIVE', message: 'Wait for your current kubi question to finish.' });

  const question = sanitizeKubiContent(sanitizeInput(req.body?.message));
  if (!question) return res.status(400).json({ error: 'KUBI_MESSAGE_REQUIRED', message: 'A kubi question is required.' });

  const repository = await DatabaseFactory.getKubiConversationRepository();
  const conversation = await repository.getConversation(userId, String(req.params.conversationId));
  if (!conversation) return res.status(404).json({ error: 'KUBI_CONVERSATION_NOT_FOUND' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  activeUsers.add(userId);

  try {
    const userMessage = kubiMessage('user', question);
    await repository.appendMessage(userId, conversation.id, userMessage);
    sendEvent(res, 'status', { state: 'thinking', label: 'kubi is understanding your question' });

    // Fixed product facts and refusals stay local: no telemetry query, provider request, or rate-limit use.
    const pendingClarification = conversation.messages[conversation.messages.length - 1]?.clarification;
    const localAnswer = pendingClarification ? null : KubiScopeService.fixedProductAnswer(question);
    if (localAnswer) {
      const assistantMessage = kubiMessage('assistant', localAnswer);
      await repository.appendMessage(userId, conversation.id, assistantMessage);
      sendEvent(res, 'answer_delta', { text: localAnswer });
      sendEvent(res, 'done', { conversationId: conversation.id, messageId: assistantMessage.id });
      auditLog.log({ user: getUserFromReq(req), action: KubiScopeService.isInScope(question) ? 'KUBI_PRODUCT_QUESTION' : 'KUBI_OUT_OF_SCOPE_QUESTION', target: `kubi/conversation/${conversation.id}`, details: KubiScopeService.isInScope(question) ? 'kubi answered a local product question.' : 'kubi declined a non-kubiq question.', ip: req.ip });
      return;
    }
    if (!consumeRequestAllowance(userId)) {
      sendEvent(res, 'error', { error: 'KUBI_RATE_LIMITED', message: 'kubi has reached its per-user request limit. Try again later.' });
      return;
    }

    const context = kubiService.getRequestContext(req);
    const isAdmin = context.user?.role === 'kubiq-admin' || context.user?.roles?.includes('kubiq-admin');
    const plan = await new KubiIntentService().plan(question, conversation.messages, Boolean(isAdmin));
    if (plan.kind !== 'answer') {
      const assistantMessage = kubiMessage('assistant', plan.message);
      if (plan.kind === 'clarify') assistantMessage.clarification = { options: plan.options, ...(plan.slot ? { slot: plan.slot, question: plan.question } : {}) };
      await repository.appendMessage(userId, conversation.id, assistantMessage);
      sendEvent(res, 'answer_delta', { text: plan.message });
      sendEvent(res, 'done', { conversationId: conversation.id, messageId: assistantMessage.id });
      auditLog.log({ user: getUserFromReq(req), action: plan.kind === 'clarify' ? 'KUBI_CLARIFICATION' : 'KUBI_OUT_OF_SCOPE_QUESTION', target: `kubi/conversation/${conversation.id}`, details: plan.kind === 'clarify' ? 'kubi requested clarification.' : 'kubi declined an unsupported request.', ip: req.ip });
      return;
    }

    const labels = { searching: 'kubi is finding permitted evidence', working: 'kubi is connecting the evidence', composing: 'kubi is composing an evidence-backed answer' };
    const result = await kubiService.stream(plan.question, conversation.messages, context,
      delta => sendEvent(res, 'answer_delta', { text: delta }),
      state => sendEvent(res, 'status', { state, label: labels[state] }), plan);
    const assistantMessage = kubiMessage('assistant', result.answer, result.evidence);
    assistantMessage.request = { question: plan.question, domains: plan.domains };
    await repository.appendMessage(userId, conversation.id, assistantMessage);

    for (const reference of result.evidence) sendEvent(res, 'evidence', reference);
    sendEvent(res, 'done', { conversationId: conversation.id, messageId: assistantMessage.id });
    auditLog.log({ user: getUserFromReq(req), action: 'KUBI_QUESTION', target: `kubi/conversation/${conversation.id}`, details: 'Asked kubi an observability question.', ip: req.ip });
  } catch (error: any) {
    console.error('kubi request failed:', error?.message || error);
    const providerLimited = error?.response?.status === 429;
    sendEvent(res, 'error', { error: providerLimited ? 'KUBI_PROVIDER_RATE_LIMITED' : 'KUBI_REQUEST_FAILED', message: providerLimited ? 'The configured AI provider has reached its rate or quota limit. Please try again later; if it persists, ask your administrator to check the AI provider quota.' : 'kubi could not complete this request. Try again shortly.' });
  } finally {
    activeUsers.delete(userId);
    res.end();
  }
});
