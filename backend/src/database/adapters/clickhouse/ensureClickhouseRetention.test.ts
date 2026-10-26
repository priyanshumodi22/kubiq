import { describe, expect, jest, test } from '@jest/globals';
import type { ClickHouseClient } from '@clickhouse/client';
import { ensureClickhouseRetention } from './ensureClickhouseRetention';
function fixture(definitions: string[]) {
 const query = jest.fn<() => Promise<unknown>>();
 for (const definition of definitions) query.mockResolvedValueOnce({ json: async () => [{ create_table_query: definition }] });
 return { query, command: jest.fn<(_request: unknown) => Promise<void>>().mockResolvedValue(undefined) };
}
describe('ClickHouse retention reconciliation', () => {
 test('migrates existing tables and verifies TTL', async () => {
  const client = fixture(['CREATE TABLE', 'TTL timestamp + toIntervalSecond(86400)']);
  await ensureClickhouseRetention(client as unknown as ClickHouseClient, 'default', 'apmspans', 86400);
  expect(client.command).toHaveBeenCalledWith({query: 'ALTER TABLE `default`.apmspans MODIFY TTL timestamp + toIntervalSecond(86400) DELETE'});
 });
 test('matching TTL is idempotent', async () => {
  const client = fixture(['TTL timestamp + toIntervalSecond(86400)', 'TTL timestamp + toIntervalSecond(86400)']);
  await ensureClickhouseRetention(client as unknown as ClickHouseClient, 'default', 'app_logs', 86400);
  expect(client.command).not.toHaveBeenCalled();
 });
 test('fails rather than silently ignoring unavailable TTL', async () => {
  const client = fixture(['CREATE TABLE', 'CREATE TABLE']);
  await expect(ensureClickhouseRetention(client as unknown as ClickHouseClient, 'default', 'apmspans', 86400)).rejects.toThrow('verification failed');
 });
});
