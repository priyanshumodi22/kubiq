import { describe, expect, test } from '@jest/globals';
import { redactKubiValue, sanitizeKubiContent } from './kubiSanitizer';

describe('kubi credential redaction', () => {
  test('does not return unredacted objects after reaching its recursion bound', () => {
    const deep = { one: { two: { three: { four: { five: { six: { seven: { password: 'deep-fixture-secret' } } } } } } } };
    expect(JSON.stringify(redactKubiValue(deep))).not.toContain('deep-fixture-secret');
  });
  test('redacts every occurrence and resets the shared global pattern between calls', () => {
    const input = 'Bearer fixture-one Bearer fixture.two mysql://user:fixture@db/test token=fixture';
    const first = redactKubiValue(input);
    expect(first).not.toMatch(/fixture|mysql:\/\//);
    expect(first.match(/REDACTED/g)).toHaveLength(4);
    expect(redactKubiValue(input)).toBe(first);
  });
  test('preserves harmless values while masking sensitive nested keys', () => {
    expect(redactKubiValue({ service: 'api', status: 0, enabled: false, details: [{ apiKey: 'fixture', count: 2 }] })).toEqual({ service: 'api', status: 0, enabled: false, details: [{ apiKey: '[REDACTED]', count: 2 }] });
    expect(sanitizeKubiContent('x'.repeat(5000))).toHaveLength(4000);
  });
  test('retains leftmost-match priority and prefix behavior for overlapping credential formats', () => {
    // Compatibility oracle for the original combined expression; fixture-only.
    const original = /(bearer\s+)[a-z0-9._-]+|(?:mongodb(?:\+srv)?|mysql):\/\/[^\s]+|(?:api[_-]?key|token|secret)\s*[=:]\s*[^\s,;]+/ig;
    const fragments = ['Bearer fixture', 'token=Bearer fixture', 'mysql://token=fixture@host/db', 'mongodb+srv://fixture@host/db', 'api-key:fixture', 'secret=token=fixture', 'plain', 'BEARER abc._-9', 'api_key = fixture,', 'token='];
    for (const left of fragments) for (const right of fragments) {
      const input = `${left} ${right}`;
      expect(redactKubiValue(input)).toBe(input.replaceAll(original, '$1[REDACTED]'));
    }
  });
  test('handles long mixed input without leaving sensitive matches behind', () => {
    const input = 'ordinary token=fixture; Bearer fixture\n'.repeat(5000);
    const result = redactKubiValue(input);
    expect(result).not.toContain('fixture');
    expect(result.match(/REDACTED/g)).toHaveLength(10000);
  });
});
