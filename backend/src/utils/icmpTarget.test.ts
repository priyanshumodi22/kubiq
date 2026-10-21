import { endpointToIcmpHost } from './icmpTarget';
import { describe, expect, test } from '@jest/globals';

describe('ICMP target normalization', () => {
  test.each([
    ['https://example.com/health', 'example.com'], ['example.com:443', 'example.com'],
    ['127.0.0.1', '127.0.0.1'], ['[::1]:443', '::1'], ['http://[::1]/health', '::1'], ['::1', '::1'],
  ])('normalizes %s', (input, expected) => expect(endpointToIcmpHost(input)).toBe(expected));
  test.each(['', 'host; touch /tmp/pwned', '-c 99999', 'example.com:invalid', 'example.com:443:80', 'example.com:', '[::1', 'x'.repeat(10000)])('rejects unsafe target %s', input => {
    expect(endpointToIcmpHost(input)).toBeNull();
  });
});
