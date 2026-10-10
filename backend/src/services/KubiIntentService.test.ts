import { describe, expect, it, jest } from '@jest/globals';
import { KubiIntentService } from './KubiIntentService';
import { KubiProviderService } from './KubiProviderService';

describe('kubi conversation planning', () => {
  it('treats read as an exact username when that field is pending', async () => {
    const provider = jest.spyOn(KubiProviderService.prototype, 'complete');
    try {
      const result = await new KubiIntentService().plan('read', [{ id: '1', role: 'assistant', content: 'Type the username', createdAt: '', clarification: { options: [], slot: 'auditTarget' } }], true);
      expect(result.kind).toBe('answer');
      expect(result.auditTarget).toBe('read');
      expect(provider).not.toHaveBeenCalled();
    } finally { provider.mockRestore(); }
  });
  it.each(['not json', '{"kind":"answer","domains":["shell"],"question":"run it"}', '{"kind":"answer","domains":[]}'])('asks for clarification on invalid provider output', raw => {
    expect(KubiIntentService.validate(raw, true).kind).toBe('clarify');
  });
  it('enforces admin-only audit even when the model proposes it for a viewer', () => {
    const result = KubiIntentService.validate(JSON.stringify({ kind: 'answer', domains: ['audit'], question: 'My own history', auditTarget: '@self', userAccessHistory: true }), false);
    expect(result.kind).toBe('refuse');
    expect(result.options).toEqual([]);
  });
  it('requires an explicit user target and Kubernetes namespace', () => {
    expect(KubiIntentService.validate(JSON.stringify({ kind: 'answer', domains: ['audit'], question: 'Who changed roles?', userAccessHistory: true }), true).kind).toBe('clarify');
    expect(KubiIntentService.validate(JSON.stringify({ kind: 'answer', domains: ['kubernetes'], question: 'Investigate pods' }), true).kind).toBe('clarify');
  });
  it('passes prior clarification and typed answers to interpretation', async () => {
    const provider = jest.spyOn(KubiProviderService.prototype, 'complete').mockResolvedValue(JSON.stringify({ kind: 'answer', domains: ['audit'], question: 'My role and namespace update history', auditTarget: '@self', userAccessHistory: true }));
    try {
      const result = await new KubiIntentService().plan('my account please', [{ id: '1', role: 'assistant', content: 'Whose history?', createdAt: '', clarification: { options: ['My account', 'All users'] } }], true);
      expect(result.auditTarget).toBe('@self');
      expect(JSON.stringify(provider.mock.calls[0][0])).toContain('Whose history?');
      expect(JSON.stringify(provider.mock.calls[0][0])).toContain('my account please');
    } finally { provider.mockRestore(); }
  });
});
