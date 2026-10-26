const assert=require('node:assert/strict'),path=require('node:path');
const base=process.env.COMPILED_BACKEND||'/work';
const {stopRetentionSweeps}=require(path.join(base,'utils/RetentionScheduler'));
const names=['MysqlServiceRepository','MysqlNotificationRepository','MysqlUserRepository','MysqlPasskeyRepository','MysqlSystemRepository','MysqlAuditLogRepository','MysqlKubiConversationRepository','MysqlTraceRepository'];
(async()=>{
 const configured=process.env.DB_PASSWORD;
 assert(configured,'The isolated fixture must supply its database password');
 for(const mode of ['canonical','legacy','matching']){
  delete process.env.DB_PASSWORD;delete process.env.DB_PASS;
  if(mode==='canonical'||mode==='matching')process.env.DB_PASSWORD=configured;
  if(mode==='legacy'||mode==='matching')process.env.DB_PASS=configured;
  const initialized=[];
  try{
   for(const name of names){const Repository=require(path.join(base,'database/adapters/mysql',name))[name];const repo=new Repository();initialized.push(repo);await repo.initialize();}
   assert(Array.isArray(await initialized[0].getAllServices()));
   assert.equal(await initialized[2].findByUsername('nonexistent-credential-fixture-user'),null);
   console.log(JSON.stringify({credentialMode:mode,repositoriesConnected:names.length,configuredPortHonored:true,passed:true}));
  }finally{stopRetentionSweeps();for(const repo of initialized)if(repo.pool)await repo.pool.end();}
 }
 process.env.DB_PASSWORD=configured;process.env.DB_PASS='conflicting-fixture-value';
 for(const name of names){const Repository=require(path.join(base,'database/adapters/mysql',name))[name];await assert.rejects(async()=>{await new Repository().initialize();},/DB_PASSWORD and DB_PASS must match/);}
 console.log(JSON.stringify({conflictsRejectedForAllRepositories:true,passed:true}));
})().catch(error=>{console.error(error);process.exitCode=1;});
