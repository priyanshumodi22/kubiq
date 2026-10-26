const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {MongoClient}=require('mongodb');
const service='kubiq-retention-check-'+randomBytes(8).toString('hex');
const endpoint='http://kubiq.kubiq-system.svc.cluster.local/kubiq-api/api';
(async()=>{
 const client=new MongoClient(process.env.DB_URI,{maxPoolSize:1,serverSelectionTimeoutMS:15000});await client.connect();const db=client.db();
 try {
  const now=Date.now();
  const span=(name,time)=>({traceId:randomBytes(16).toString('hex'),spanId:randomBytes(8).toString('hex'),name,kind:2,startTimeUnixNano:String(BigInt(time)*1000000n),endTimeUnixNano:String(BigInt(time+5)*1000000n),status:{code:1}});
  const body={resourceSpans:[{resource:{attributes:[{key:'service.name',value:{stringValue:service}}]},scopeSpans:[{scope:{name:'retention-verification'},spans:[span('recent',now),span('expired',now-4*86400000)]}]}]};
  const denied=await fetch(endpoint+'/apm/v1/traces',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(denied.status,401);
  const headers={'Content-Type':'application/json',Authorization:'Bearer '+process.env.KUBIQ_INGESTION_TOKEN};
  const apm=await fetch(endpoint+'/apm/v1/traces',{method:'POST',headers,body:JSON.stringify(body)});assert.equal(apm.status,202);assert.equal(await apm.text(),'');
  const logs=await fetch(endpoint+'/telemetry/logs',{method:'POST',headers,body:JSON.stringify([{serviceName:service,sourceName:'recent',level:'INFO',message:'Disposable retention verification',timestamp:new Date(now).toISOString()},{serviceName:service,sourceName:'expired',level:'INFO',message:'Disposable retention verification',timestamp:new Date(now-8*86400000).toISOString()}])});assert.equal(logs.status,202);
  const deadline=Date.now()+150000;let counts;
  do {
   counts={};for(const [collection,field] of [['apmspans','name'],['logs','sourceName']]) counts[collection]={recent:await db.collection(collection).countDocuments({serviceName:service,[field]:'recent'}),expired:await db.collection(collection).countDocuments({serviceName:service,[field]:'expired'})};
   if(Object.values(counts).every(x=>x.recent===1&&x.expired===0))break;
   await new Promise(resolve=>setTimeout(resolve,2000));
  }while(Date.now()<deadline);
  assert(Object.values(counts).every(x=>x.recent===1&&x.expired===0),'Expected recent telemetry retained and expired telemetry removed');
  const indexes={};for(const collection of ['apmspans','logs'])indexes[collection]=(await db.collection(collection).listIndexes().toArray()).filter(i=>i.expireAfterSeconds!==undefined).map(i=>({key:i.key,expireAfterSeconds:i.expireAfterSeconds}));
  console.log(JSON.stringify({passed:true,http:{unauthenticated:denied.status,apm:apm.status,logs:logs.status},counts,indexes}));
 }finally {
  for(const collection of ['apmspans','logs'])await db.collection(collection).deleteMany({serviceName:service});
  const remaining=await Promise.all(['apmspans','logs'].map(c=>db.collection(c).countDocuments({serviceName:service})));assert(remaining.every(x=>x===0));
  await client.close();console.log(JSON.stringify({fixtureCleanupVerified:true}));
 }
})().catch(e=>{console.error('Live retention check failed',e.code||e.message);process.exitCode=1;});
