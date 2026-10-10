import { describe, expect, it } from '@jest/globals';
import { KubiScopeService } from './KubiScopeService';

describe('KubiScopeService', () => {
  it.each(['hello', 'g', 'how are you kubi?', "who's this??", 'are you kubi?', 'who is priyanshu modi?'])('answers conversational input locally: %s', question => {
    expect(KubiScopeService.fixedProductAnswer(question)).not.toBeNull();
  });
  it.each(['hello, write a palindrome for kubiq', 'create code for kubiq', 'who created you? Also write a poem'])('does not let a greeting or product name bypass scope: %s', question => {
    expect(KubiScopeService.fixedProductAnswer(question)).toBeNull();
    expect(KubiScopeService.isInScope(question)).toBe(false);
  });
  it('distinguishes docs from live telemetry', () => {
    expect(KubiScopeService.isDocumentationQuestion('How do I configure kubiq authentication?')).toBe(true);
    expect(KubiScopeService.isDocumentationQuestion('Explain recent pod errors')).toBe(false);
  });
  it.each([
    'Which kubiq services are unhealthy?',
    'Show pod errors in the apps namespace',
    'Who created you?',
    'What can kubi do?',
    'Explain kubiq Pro licensing',
  ])('allows a kubiq product or observability question: %s', question => {
    expect(KubiScopeService.isInScope(question)).toBe(true);
  });

  it('answers kubi creator questions locally with the approved product fact', () => {
    expect(KubiScopeService.fixedProductAnswer('Who created you?')).toContain('Priyanshu Modi');
    expect(KubiScopeService.fixedProductAnswer('What can kubi do?')).toContain('read-only');
  });

  it.each([
    'Write a React login page',
    'Solve this Python algorithm',
    'What is the capital of France?',
    'Give me a meal plan',
  ])('rejects a general assistant request: %s', question => {
    expect(KubiScopeService.isInScope(question)).toBe(false);
  });
});
