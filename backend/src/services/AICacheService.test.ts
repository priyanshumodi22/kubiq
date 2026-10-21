import { describe, expect, it, jest } from '@jest/globals';
import { AICacheService } from './AICacheService';

describe('AI summary cache identity', () => {
  const cache = AICacheService.getInstance();
  it('keeps service and bucket keys isolated after digest modernization', () => {
    cache.saveSummary('cache-test/a', 100, 200, 'first');
    cache.saveSummary('cache-test/a', 200, 300, 'second');
    cache.saveSummary('cache-test/b', 100, 200, 'other');
    expect(cache.getSummary('cache-test/a', 100)?.summary).toBe('first');
    expect(cache.getSummary('cache-test/a', 200)?.summary).toBe('second');
    expect(cache.getSummary('cache-test/b', 100)?.summary).toBe('other');
  });
  it('uses the same digest for recent-summary lookup', () => {
    const clock = jest.spyOn(Date, 'now');
    try {
      clock.mockReturnValue(1000);
      cache.saveSummary('cache-recent', 100, 200, 'older');
      clock.mockReturnValue(2000);
      cache.saveSummary('cache-recent', 200, 300, 'newer');
      expect(cache.getMostRecentSummary('cache-recent')?.summary).toBe('newer');
    } finally { clock.mockRestore(); }
  });
  it('retains deterministic fifteen-minute bucketing', () => {
    expect(cache.calculateTimeBucket(900001)).toEqual({ start: 900000, end: 1800000 });
  });
});
