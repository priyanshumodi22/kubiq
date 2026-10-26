import { afterEach, describe, expect, jest, test } from '@jest/globals';
import mysql from 'mysql2/promise';
import { MysqlTraceRepository } from './MysqlTraceRepository';
import { stopRetentionSweeps } from '../../../utils/RetentionScheduler';
jest.mock('mysql2/promise', () => ({ __esModule: true, default: { createPool: jest.fn() } }));
afterEach(() => { stopRetentionSweeps(); jest.useRealTimers(); jest.restoreAllMocks(); });
function fixture() {
 const query = jest.fn<() => Promise<void>>().mockResolvedValue(undefined), release = jest.fn();
 const execute = jest.fn<(_sql: string, _args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
 (mysql.createPool as jest.Mock).mockReturnValue({ getConnection: async () => ({query,release}), execute });
 return { query, release, execute, repository: new MysqlTraceRepository() };
}
describe('SQL adapter retention', () => {
 test('bound indexed sweeps run once per minute without duplicate initialization', async () => {
  jest.useFakeTimers(); const f = fixture(); const now = Date.now();
  await f.repository.initialize(); await f.repository.initialize();
  expect(f.release).toHaveBeenCalledTimes(1);
  expect(f.execute).toHaveBeenCalledWith('DELETE FROM apm_spans WHERE timestamp < ? ORDER BY timestamp LIMIT 1000', [new Date(now-259200000)]);
  await jest.advanceTimersByTimeAsync(60000); expect(f.execute).toHaveBeenCalledTimes(2);
 });
 test('releases the connection and propagates creation failures', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined); const f=fixture(); f.query.mockRejectedValueOnce(new Error('create denied'));
  await expect(f.repository.initialize()).rejects.toThrow('create denied'); expect(f.release).toHaveBeenCalledTimes(1);
 });
 test('does not mark a denied deletion as successful initialization', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined); const f=fixture(); f.execute.mockRejectedValueOnce(new Error('delete denied'));
  await expect(f.repository.initialize()).rejects.toThrow('delete denied');
  await f.repository.initialize(); expect(f.execute).toHaveBeenCalledTimes(2);
 });
});
