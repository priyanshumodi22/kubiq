const assert=require('node:assert/strict');
const mongoose=require('../../backend/node_modules/mongoose');
const {randomBytes}=require('node:crypto');
const {MongoServiceRepository}=require('../../backend/dist/database/adapters/mongo/MongoServiceRepository');
const {MongoUserRepository}=require('../../backend/dist/database/adapters/mongo/MongoUserRepository');
const {MongoSystemRepository}=require('../../backend/dist/database/adapters/mongo/MongoSystemRepository');
const {MongoPasskeyRepository}=require('../../backend/dist/database/adapters/mongo/MongoPasskeyRepository');
const {MongoNotificationRepository}=require('../../backend/dist/database/adapters/mongo/MongoNotificationRepository');
const {MongoKubiConversationRepository}=require('../../backend/dist/database/adapters/mongo/MongoKubiConversationRepository');
const {MongoAuditLogRepository}=require('../../backend/dist/database/adapters/mongo/MongoAuditLogRepository');
const {MongoTraceRepository}=require('../../backend/dist/database/adapters/mongo/MongoTraceRepository');
const {MongoLogRepository}=require('../../backend/dist/database/adapters/mongo/MongoLogRepository');
(async()=>{
 assert(process.env.TARGET_URI,'Private target URI must be injected');
 const dburi=process.env.TARGET_URI;process.env.DB_URI=dburi;
 await mongoose.connect(dburi,{serverSelectionTimeoutMS:10000});
 const repos={services:new MongoServiceRepository(),users:new MongoUserRepository(),system:new MongoSystemRepository(),passkeys:new MongoPasskeyRepository(),notifications:new MongoNotificationRepository(),conversations:new MongoKubiConversationRepository(),audit:new MongoAuditLogRepository(),traces:new MongoTraceRepository(),logs:new MongoLogRepository()};
 try{
  for(const repo of Object.values(repos))await repo.initialize();
  const services=await repos.services.getAllServices(),users=await repos.users.getAllUsers();
  assert.equal(services.length,6);assert.equal(users.length,3);
  const configPresence={license:!!(await repos.system.getLicenseActivation()),ai:!!(await repos.system.getKubiAiConfig()),rbac:!!(await repos.system.getRbacConfig())};
  console.log(JSON.stringify({phase:'read-config',configPresence}));
  assert.equal((await repos.notifications.getAllChannels()).length,1);
  let passkeys=0,conversations=0;
  for(const id of await mongoose.connection.db.collection('passkeys').distinct('userId'))passkeys+=(await repos.passkeys.findByUserId(id)).length;
  for(const id of await mongoose.connection.db.collection('kubiconversations').distinct('userId'))conversations+=(await repos.conversations.listConversations(id)).length;
  console.log(JSON.stringify({phase:'read-owned-records',passkeys,conversations}));
  assert.equal(passkeys,4,'passkeys');assert.equal(conversations,6,'conversations');
  assert((await repos.audit.getAuditLogs(5)).length>0);
  const id=randomBytes(16).toString('hex'),span=randomBytes(8).toString('hex'),service='migration-compat-'+id;
  try{
   await repos.traces.insertSpans([{traceId:id,spanId:span,name:'migration-check',serviceName:service,kind:2,startTimeUnixNano:Date.now()*1e6,endTimeUnixNano:(Date.now()+5)*1e6,durationMs:5,status:{code:1},attributes:{}}]);
   assert.equal((await repos.traces.getTraceDetails(id)).length,1);
  }finally{await mongoose.connection.db.collection('apmspans').deleteMany({serviceName:service});assert.equal(await mongoose.connection.db.collection('apmspans').countDocuments({serviceName:service}),0);}
  console.log(JSON.stringify({passed:true,initializedRepositories:Object.keys(repos),services:services.length,users:users.length,passkeys,conversations,licenseRbacAndAiConfigReadable:true,configPresence,traceWriteReadCleanup:true}));
 }finally{await mongoose.disconnect();}
})().catch(e=>{console.error('Adapter compatibility failed',e.message);process.exitCode=1;mongoose.disconnect();});
