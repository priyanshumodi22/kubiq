import { describe, test, expect } from '@jest/globals';
import { retentionSeconds } from './RetentionPolicy';
describe('retention configuration', () => {
 test('defaults and legacy aliases', () => {
  expect(retentionSeconds('APM', {})).toBe(259200);
  expect(retentionSeconds('LOG', {})).toBe(604800);
  expect(retentionSeconds('LOG', { LOG_RETENTION_DAYS: '2' })).toBe(172800);
  expect(retentionSeconds('APM', { APM_RETENTION_DAYS: '1' })).toBe(86400);
  expect(retentionSeconds('LOG', { LOG_RETENTION_PERIOD: '12h', LOG_RETENTION_DAYS: '7' })).toBe(43200);
 });
 test.each([['24h', 86400], [' 2 HOURS ', 7200], ['1w', 604800], ['60s', 60]])('parses %s', (value, seconds) => expect(retentionSeconds('APM', { APM_RETENTION_PERIOD: value })).toBe(seconds));
 test.each(['', 'bad', '-1d', '0s', '2.5h', '999999999999w'])('rejects duration %s', value => expect(() => retentionSeconds('APM', { APM_RETENTION_PERIOD: value })).toThrow());
 test.each(['', '0', '-1', 'NaN', '2.5'])('rejects legacy days %s', value => expect(() => retentionSeconds('LOG', { LOG_RETENTION_DAYS: value })).toThrow());
});
