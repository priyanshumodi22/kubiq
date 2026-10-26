import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { clickhouseService } from '../../../services/ClickhouseService';
import { ClickhouseTraceRepository } from './ClickhouseTraceRepository';
import { ClickhouseLogRepository } from './ClickhouseLogRepository';
afterEach(() => { jest.restoreAllMocks(); });
describe('ClickHouse repository startup gates', () => {
 test.each([['APM',259200],['LOG',604800]] as const)('%s initializes and verifies the correct policy', async (kind,seconds) => {
  const command=jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const query=jest.fn<() => Promise<unknown>>().mockResolvedValue({json:async()=>[{create_table_query:`TTL timestamp + toIntervalSecond(${seconds})`}]});
  jest.spyOn(clickhouseService,'getClient').mockReturnValue({command,query} as unknown as ReturnType<typeof clickhouseService.getClient>);
  jest.spyOn(clickhouseService,'getDatabase').mockReturnValue('default');
  const repository=kind==='APM'?new ClickhouseTraceRepository():new ClickhouseLogRepository();
  await repository.initialize(); await repository.initialize(); expect(command).toHaveBeenCalledTimes(1); expect(query).toHaveBeenCalledTimes(2);
 });
 test.each([ClickhouseTraceRepository,ClickhouseLogRepository])('rejects missing client and table creation failure',async Repository=>{
  jest.spyOn(console,'error').mockImplementation(()=>undefined);
  const client=jest.spyOn(clickhouseService,'getClient').mockReturnValue(null);
  await expect(new Repository().initialize()).rejects.toThrow('not configured');
  client.mockReturnValue({command:async()=>{throw new Error('denied');}} as unknown as ReturnType<typeof clickhouseService.getClient>);
  await expect(new Repository().initialize()).rejects.toThrow('denied');
 });
});
