import { afterEach, expect, jest, test } from '@jest/globals';
import { shutdownDeadline } from './shutdownDeadline';
afterEach(() => { jest.useRealTimers(); });
test('successful shutdown awaits every stage in order', async () => {
    const stages: number[] = [];
    expect(await shutdownDeadline(async () => { stages.push(1); await Promise.resolve(); stages.push(2); })).toBe(true);
    expect(stages).toEqual([1, 2]);
});
test('shutdown failures return failure without exposing error details', async () => {
    expect(await shutdownDeadline(async () => { throw new Error('SYNTHETIC_SECRET'); })).toBe(false);
});
test('a hung shutdown is bounded by the total deadline', async () => {
    jest.useFakeTimers();
    const shutdown = shutdownDeadline(() => new Promise(() => {}));
    await jest.advanceTimersByTimeAsync(4999);
    let complete = false;
    shutdown.then(() => { complete = true; });
    await Promise.resolve();
    expect(complete).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(await shutdown).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
});
