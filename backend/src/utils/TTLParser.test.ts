import { describe, expect, test } from '@jest/globals';
import { parseTTLToSeconds } from './TTLParser';

describe('TTL unit normalization', () => {
  test.each([['0s', 0], [' 2 HOURS ', 7200], ['3min', 42], ['3 minutes', 180], ['1 day', 86400], ['2w', 1209600], ['-1s', 42], ['2.5h', 42], ['garbage', 42], [undefined, 42]])('preserves %s -> %s', (input, expected) => {
    expect(parseTTLToSeconds(input, 42)).toBe(expected);
  });
});
