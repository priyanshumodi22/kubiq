const assert = require('node:assert/strict');
const path = require('node:path');
const mongoose = require('mongoose');
const base = process.env.COMPILED_BACKEND || '/work';
process.env.APM_RETENTION_PERIOD = '5s'; process.env.LOG_RETENTION_PERIOD = '7s';
const { ApmSpanModel } = require(path.join(base,'database/schemas/ApmSpanSchema'));
const { LogModel } = require(path.join(base,'database/schemas/LogSchema'));
const { MongoTraceRepository } = require(path.join(base,'database/adapters/mongo/MongoTraceRepository'));
const { MongoLogRepository } = require(path.join(base,'database/adapters/mongo/MongoLogRepository'));
const { ensureRetentionIndex } = require(path.join(base,'database/adapters/mongo/ensureRetentionIndex'));
(async () => {
 await mongoose.connect(process.env.FIXTURE_MONGO_URI || 'mongodb://127.0.0.1:27017/retention_fixture');
 const repos = [new MongoTraceRepository(), new MongoLogRepository()];
 const models = [ApmSpanModel, LogModel];
 for (const model of models) {
  assert.equal(model.schema.indexes().filter(([key]) => Object.keys(key).length===1 && key.timestamp===1).length,1);
  await model.createCollection();
  await model.collection.createIndex({timestamp:1});
  await model.collection.createIndex({fixtureMarker:1},{name:'keep_fixture_index'});
  await model.collection.insertMany([{spanId:model.modelName+'-old',fixtureMarker:'expired',timestamp:new Date(Date.now()-3600000)}, {spanId:model.modelName+'-recent',fixtureMarker:'recent',timestamp:new Date(Date.now()+3600000)}]);
 }
 await Promise.all(repos.map(repo=>repo.initialize()));
 for(const [i,model] of models.entries()) {
  const indexes=await model.collection.listIndexes().toArray();
  assert.equal(indexes.find(x=>x.name==='timestamp_1').expireAfterSeconds,[5,7][i]);
  assert(indexes.some(x=>x.name==='keep_fixture_index'));
 }
 const deadline=Date.now()+90000;
 while(Date.now()<deadline && (await Promise.all(models.map(m=>m.collection.countDocuments({fixtureMarker:'expired'})))).some(Boolean)) await new Promise(r=>setTimeout(r,1000));
 for(const model of models) {
  assert.equal(await model.collection.countDocuments({fixtureMarker:'expired'}),0);
  assert.equal(await model.collection.countDocuments({fixtureMarker:'recent'}),1);
  // Exercise an existing TTL change using the same production helper.
  model.schema.indexes().find(([key])=>Object.keys(key).length===1 && key.timestamp===1)[1].expireAfterSeconds=60;
  await ensureRetentionIndex(model,60);
  await ensureRetentionIndex(model,60);
  // Exercise a fresh collection after removing only this disposable fixture.
  await model.collection.drop();
  await ensureRetentionIndex(model,60);
 }

 const id='1234567890abcdef1234567890abcdef', timestamp=new Date();
 await repos[1].insertLogs([
  {serviceName:'correlation',sourceName:'structured',timestamp,level:'INFO',message:'event',metadata:{trace_id:id,span_id:'1234567890abcdef'}},
  {serviceName:'correlation',sourceName:'plain',timestamp,level:'INFO',message:'trace_id='+id+' span_id=1234567890abcdef'},
  {serviceName:'correlation',sourceName:'near',timestamp,level:'INFO',message:'f'+id+'0'},
  {serviceName:'denied',sourceName:'hidden',timestamp,level:'INFO',message:id},
 ]);
 const matches=await repos[1].queryLogs('',{from:new Date(timestamp.getTime()-2000),to:new Date(timestamp.getTime()+2000),serviceNames:['correlation'],traceId:id,limit:500});
 assert.deepEqual(matches.map(row=>row.sourceName).sort(),['plain','structured']);
 const none=await repos[1].queryLogs('',{from:new Date(timestamp.getTime()-2000),to:new Date(timestamp.getTime()+2000),serviceNames:[],traceId:id,limit:500});
 assert.equal(none.length,0);
 const spanMatches=await repos[1].queryLogs('',{from:new Date(timestamp.getTime()-2000),to:new Date(timestamp.getTime()+2000),serviceNames:['correlation'],traceId:id,spanId:'1234567890abcdef',limit:500});
 assert.deepEqual(spanMatches.map(row=>row.sourceName).sort(),['plain','structured']);
 console.log(JSON.stringify({passed:true,tests:['legacy plain index conversion','connected-repository initialization','expired APM and logs removed','recent records retained','unrelated index preserved','TTL change','idempotent restart','fresh collection'],mongoVersion:(await mongoose.connection.db.admin().serverInfo()).version}));
 await mongoose.disconnect();
})().catch(e=>{console.error(e);process.exitCode=1;mongoose.disconnect();});
