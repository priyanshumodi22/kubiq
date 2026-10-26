const { MongoClient } = require('mongodb');
const { EJSON } = require('bson');
const { createGzip } = require('node:zlib');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const fs = require('node:fs');
const crypto = require('node:crypto');
(async()=>{
 const client=new MongoClient(process.env.DB_URI,{maxPoolSize:1,serverSelectionTimeoutMS:15000});
 await client.connect(); const db=client.db(); const counts={}, indexes={};
 async function* records() {
  for(const collection of ['apmspans','logs']) {
   counts[collection]=0; indexes[collection]=await db.collection(collection).listIndexes().toArray();
   for await(const document of db.collection(collection).find({}).batchSize(250)) {
    counts[collection]++; yield EJSON.stringify({collection,document},{relaxed:false})+'\n';
   }
  }
 }
 const file='/work/telemetry-before-retention.ejson.gz';
 try {
  await pipeline(Readable.from(records()),createGzip(),fs.createWriteStream(file,{mode:0o600}));
  const hash=crypto.createHash('sha256'); for await(const chunk of fs.createReadStream(file)) hash.update(chunk);
  const metadata={createdAt:new Date().toISOString(),counts,indexes,sha256:hash.digest('hex'),bytes:fs.statSync(file).size};
  fs.writeFileSync('/work/telemetry-before-retention.metadata.json',JSON.stringify(metadata),{mode:0o600});
  console.log(JSON.stringify({backupComplete:true,...metadata}));
 }finally {await client.close();}
})().catch(error=>{console.error('Backup failed',error.code||error.name);process.exitCode=1;});
