import { describe, expect, it } from '@jest/globals';
import { endpointToIcmpHost } from '../utils/icmpTarget';

describe('ServiceMonitor ICMP endpoint normalization', () => {
  it.each([
    ['api.internal', 'api.internal'],
    ['https://api.internal:8443/health', 'api.internal'],
    ['10.0.0.12:8080', '10.0.0.12'],
    ['[2001:db8::1]:443', '2001:db8::1'],
  ])('keeps supported monitor target %s', (input, expected) => {
    expect(endpointToIcmpHost(input)).toBe(expected);
  });

  it.each(['127.0.0.1; whoami', 'api.internal && id', '../etc/passwd', 'http://'])('rejects shell-like or malformed target %s', (input) => {
    expect(endpointToIcmpHost(input)).toBeNull();
  });
});
