import { describe, expect, it } from 'vitest';
import { classifyLogLevel } from './logLevel';

describe('classifyLogLevel', () => {
    it.each([
        ['[ERROR] request failed', 'error'],
        ['level=warn request retried', 'warn'],
        ['severity: INFO request completed', 'info'],
        ['{"level":"error","message":"failed"}', 'error'],
        ['{"severity":"debug","message":"details"}', 'debug'],
        ['2026-10-22T15:01:02Z CRITICAL database unavailable', 'error'],
        ['ordinary application output', 'plain'],
    ])('classifies %s as %s', (line, expected) => {
        expect(classifyLogLevel(line)).toBe(expected);
    });
});
