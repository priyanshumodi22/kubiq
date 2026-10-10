import { describe, expect, it } from '@jest/globals';
import { KubiConversationModel } from './KubiConversationSchema';

describe('kubi message persistence schema', () => {
  it('retains clarification choices and resolved request context through casting', () => {
    const doc = new KubiConversationModel({ id: 'test', userId: 'user', title: 'test', createdAt: '', updatedAt: '', expiresAt: new Date(), messages: [{ id: 'message', role: 'assistant', content: 'Whose history?', createdAt: '', clarification: { options: ['My account', 'All users'] }, request: { question: 'User access history', domains: ['audit'] } }] });
    const message = doc.toObject().messages[0];
    expect(message.clarification?.options).toEqual(['My account', 'All users']);
    expect(message.request?.domains).toEqual(['audit']);
  });
});
