import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { scheduleRetentionSweep, stopRetentionSweeps } from './RetentionScheduler';
afterEach(() => { stopRetentionSweeps(); jest.useRealTimers(); jest.restoreAllMocks(); });
describe('SQL retention lifecycle', () => {
 test('runs at startup, every minute, and stops on shutdown', async () => {
  jest.useFakeTimers(); const clean = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  await scheduleRetentionSweep(clean); expect(clean).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(60000); expect(clean).toHaveBeenCalledTimes(2);
  stopRetentionSweeps(); await jest.advanceTimersByTimeAsync(60000); expect(clean).toHaveBeenCalledTimes(2);
 });
 test('startup failure prevents scheduling; later failures retry', async () => {
  jest.useFakeTimers(); jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const fail = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('denied'));
  await expect(scheduleRetentionSweep(fail)).rejects.toThrow('denied'); expect(jest.getTimerCount()).toBe(0);
  const clean = jest.fn<() => Promise<void>>().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  await scheduleRetentionSweep(clean); await jest.advanceTimersByTimeAsync(120000); expect(clean).toHaveBeenCalledTimes(3);
 });
 test('does not overlap slow sweeps', async () => {
  jest.useFakeTimers(); let finish: () => void = () => undefined;
  const clean = jest.fn<() => Promise<void>>().mockResolvedValueOnce(undefined).mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  await scheduleRetentionSweep(clean); await jest.advanceTimersByTimeAsync(120000); expect(clean).toHaveBeenCalledTimes(2); finish();
 });
});
