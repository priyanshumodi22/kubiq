import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import mysql from 'mysql2/promise';
import { MysqlServiceRepository } from './MysqlServiceRepository';
import { MysqlUserRepository } from './MysqlUserRepository';
import { MysqlNotificationRepository } from './MysqlNotificationRepository';
import { MysqlPasskeyRepository } from './MysqlPasskeyRepository';
import { MysqlSystemRepository } from './MysqlSystemRepository';
import { MysqlAuditLogRepository } from './MysqlAuditLogRepository';
import { MysqlKubiConversationRepository } from './MysqlKubiConversationRepository';
import { MysqlTraceRepository } from './MysqlTraceRepository';
jest.mock('mysql2/promise', () => ({__esModule:true,default:{createPool:jest.fn()}}));
const original=process.env;
const repositories=[MysqlServiceRepository,MysqlUserRepository,MysqlNotificationRepository,MysqlPasskeyRepository,MysqlSystemRepository,MysqlAuditLogRepository,MysqlKubiConversationRepository,MysqlTraceRepository];
const captured=new Error('pool configuration captured before network access');
beforeEach(()=>{process.env={...original,DB_PORT:'3337'};delete process.env.DB_PASSWORD;delete process.env.DB_PASS;jest.mocked(mysql.createPool).mockReset().mockImplementation(()=>{throw captured;});});
afterEach(()=>{process.env=original;});
describe.each(repositories)('SQL repository credential compatibility',Repository=>{
 test.each(['canonical','legacy','matching','empty','unset'])('uses the shared %s policy and configured port',async mode=>{
  if(mode==='canonical'||mode==='matching')process.env.DB_PASSWORD='fixture';
  if(mode==='legacy'||mode==='matching')process.env.DB_PASS='fixture';
  if(mode==='empty')process.env.DB_PASSWORD='';
  await expect((async()=>{await new Repository().initialize();})()).rejects.toBe(captured);
  const options=jest.mocked(mysql.createPool).mock.calls[0][0];expect(options).toEqual(expect.objectContaining({password:mode==='empty'||mode==='unset'?'':'fixture',port:3337}));
 });
 test('retains the default SQL port',async()=>{
  delete process.env.DB_PORT;
  await expect((async()=>{await new Repository().initialize();})()).rejects.toBe(captured);
  expect(jest.mocked(mysql.createPool).mock.calls[0][0]).toEqual(expect.objectContaining({port:3306}));
 });
 test('rejects conflicting credentials before constructing a pool',async()=>{
  process.env.DB_PASSWORD='first';process.env.DB_PASS='second';
  await expect((async()=>{await new Repository().initialize();})()).rejects.toThrow('must match');expect(mysql.createPool).not.toHaveBeenCalled();
 });
});
