const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.env.COMPILED_BACKEND || '/work';
const { clickhouseService } = require(path.join(base,'services/ClickhouseService'));
const { ClickhouseTraceRepository } = require(path.join(base,'database/adapters/clickhouse/ClickhouseTraceRepository'));
const { ClickhouseLogRepository } = require(path.join(base,'database/adapters/clickhouse/ClickhouseLogRepository'));
const { ensureClickhouseRetention } = require(path.join(base,'database/adapters/clickhouse/ensureClickhouseRetention'));
(async () => {
 await clickhouseService.initialize();
 const client = clickhouseService.getClient();
 const trace = new ClickhouseTraceRepository(), log = new ClickhouseLogRepository();
 await trace.initialize(); await log.initialize();
 for(const table of ['apmspans','app_logs']) {
  // Remove native TTL only in the disposable fixture to reproduce legacy installations.
  await client.command({query:`ALTER TABLE default.${table} REMOVE TTL`});
  await ensureClickhouseRetention(client,'default',table,5);
  await ensureClickhouseRetention(client,'default',table,5);
 }
 await client.insert({table:'default.apmspans',format:'JSONEachRow',values:[{traceId:'old',spanId:'old',serviceName:'fixture',timestamp:'2000-01-01 00:00:00'},{traceId:'recent',spanId:'recent',serviceName:'fixture',timestamp:'2099-01-01 00:00:00'}]});
 await client.insert({table:'default.app_logs',format:'JSONEachRow',values:[{serviceName:'fixture',sourceName:'old',timestamp:'2000-01-01 00:00:00'},{serviceName:'fixture',sourceName:'recent',timestamp:'2099-01-01 00:00:00'}]});
 for(const [table,column] of [['apmspans','spanId'],['app_logs','sourceName']]) {
  // Force a merge in the fixture so the test does not wait hours for background TTL merges.
  await client.command({query:`OPTIMIZE TABLE default.${table} FINAL`});
  const result = await client.query({query:`SELECT ${column} AS id FROM default.${table}`,format:'JSONEachRow'});
  assert.deepEqual(await result.json(),[{id:'recent'}]);
  await ensureClickhouseRetention(client,'default',table,60);
 }

 const id='1234567890abcdef1234567890abcdef', timestamp=new Date();
 await log.insertLogs([
  {serviceName:'correlation',sourceName:'structured',timestamp,level:'INFO',message:'event',metadata:{trace_id:id}},
  {serviceName:'correlation',sourceName:'plain',timestamp,level:'INFO',message:'trace_id='+id},
  {serviceName:'correlation',sourceName:'near',timestamp,level:'INFO',message:'f'+id+'0'},
  {serviceName:'denied',sourceName:'hidden',timestamp,level:'INFO',message:id},
 ]);
 const matches=await log.queryLogs('',{from:new Date(timestamp.getTime()-2000),to:new Date(timestamp.getTime()+2000),serviceNames:['correlation'],traceId:id,limit:500});
 assert.deepEqual(matches.map(row=>row.sourceName).sort(),['plain','structured']);
 const none=await log.queryLogs('',{from:new Date(timestamp.getTime()-2000),to:new Date(timestamp.getTime()+2000),serviceNames:[],traceId:id,limit:500});
 assert.equal(none.length,0);
 const result = await client.query({query:'SELECT version() AS version',format:'JSONEachRow'});
 console.log(JSON.stringify({passed:true,version:await result.json(),tests:['fresh tables','legacy TTL migration','idempotency','expiry during merge','recent preserved','TTL change']}));
 await client.close();
})().catch(e=>{console.error(e);process.exit(1);});
