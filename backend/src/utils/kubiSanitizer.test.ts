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
});
