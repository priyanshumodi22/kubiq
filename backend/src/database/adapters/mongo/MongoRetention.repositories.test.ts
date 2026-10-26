import { describe, expect, jest, test } from '@jest/globals';
import { MongoTraceRepository } from './MongoTraceRepository';
import { MongoLogRepository } from './MongoLogRepository';
import { ensureRetentionIndex } from './ensureRetentionIndex';
jest.mock('./ensureRetentionIndex', () => ({ensureRetentionIndex:jest.fn<() => Promise<void>>().mockResolvedValue(undefined)}));
describe('Mongo repositories verify expiry',()=>{
 test('connected trace repository still verifies once and retries failed setup',async()=>{
  const ensure=jest.mocked(ensureRetentionIndex); ensure.mockClear(); ensure.mockRejectedValueOnce(new Error('denied'));
  const repo=new MongoTraceRepository(); await expect(repo.initialize()).rejects.toThrow('denied');
  await repo.initialize(); await repo.initialize(); expect(ensure).toHaveBeenCalledTimes(2);
  expect(ensure.mock.calls[1][1]).toBe(259200);
 });
 test('log repository uses the log policy',async()=>{
  const ensure=jest.mocked(ensureRetentionIndex); ensure.mockClear(); await new MongoLogRepository().initialize();
  expect(ensure.mock.calls[0][1]).toBe(604800);
 });
});
