import { describe, test, expect, jest } from '@jest/globals';
import type { Model } from 'mongoose';
import { ensureRetentionIndex } from './ensureRetentionIndex';
function fixture(initial: any[], verified: any[] = [{ key: { timestamp: 1 }, expireAfterSeconds: 86400 }]) {
 const toArray = jest.fn<() => Promise<any[]>>().mockResolvedValueOnce(initial).mockResolvedValueOnce(verified);
 return { createCollection: jest.fn<() => Promise<void>>().mockResolvedValue(undefined), createIndexes: jest.fn<() => Promise<void>>().mockResolvedValue(undefined), collection: { collectionName: 'apmspans', listIndexes: () => ({ toArray }) }, db: { db: { command: jest.fn<(_command: unknown) => Promise<{ok: number}>>().mockResolvedValue({ ok: 1 }) } } };
}
describe('retention migration', () => {
 test('upgrades the legacy index', async () => {
  const m = fixture([{ name: 'timestamp_1', key: { timestamp: 1 } }]);
  await ensureRetentionIndex(m as unknown as Model<any>, 86400);
  expect(m.db.db.command).toHaveBeenCalledWith({ collMod: 'apmspans', index: { name: 'timestamp_1', expireAfterSeconds: 86400 } });
 });
 test('fresh and already configured indexes', async () => {
  for (const initial of [[], [{ key: { timestamp: 1 }, expireAfterSeconds: 86400 }]]) {
   const m = fixture(initial); await ensureRetentionIndex(m as unknown as Model<any>, 86400);
   expect(m.db.db.command).not.toHaveBeenCalled(); expect(m.createIndexes).toHaveBeenCalledTimes(1);
  }
 });
 test('updates expiry without touching compound indexes', async () => {
  const m = fixture([{ key: { serviceName: 1, timestamp: -1 } }, { name: 'timestamp_1', key: { timestamp: 1 }, expireAfterSeconds: 259200 }]);
  await ensureRetentionIndex(m as unknown as Model<any>, 86400); expect(m.db.db.command).toHaveBeenCalledTimes(1);
 });
 test('propagates denial and rejects failed verification', async () => {
  const m = fixture([{ name: 'timestamp_1', key: { timestamp: 1 } }]); m.db.db.command.mockRejectedValueOnce(new Error('denied'));
  await expect(ensureRetentionIndex(m as unknown as Model<any>, 86400)).rejects.toThrow('denied');
  await expect(ensureRetentionIndex(fixture([], []) as unknown as Model<any>, 86400)).rejects.toThrow('verification failed');
 });
});
