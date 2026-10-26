const fs=require('fs'), {URL}=require('url');
const app=new Mongo(process.env.APP_URI),d=app.getDB('kubiq');
const name='_migration_auth_check_'+Date.now();
try{d.getCollection(name).insertOne({check:true});if(d.getCollection(name).countDocuments({check:true})!==1)throw Error('CRUD failed');}
finally{d.getCollection(name).drop();}
let unauth=false,badPassword=false,adminDenied=false;
try{new Mongo('mongodb://mongodb.mongodb-system.svc.cluster.local:27017/kubiq').getDB('kubiq').getCollection('users').findOne();}catch(e){unauth=e.code===13||e.code===18;}
try{const u=new URL(process.env.APP_URI);u.password='deliberately-invalid';new Mongo(u.toString()).getDB('kubiq').getCollection('users').findOne();}catch(e){badPassword=e.code===18;}
try{app.getDB('admin').createUser({user:'forbidden-migration-check',pwd:'not-used',roles:[]});}catch(e){adminDenied=e.code===13;}
if(!unauth||!badPassword||!adminDenied)throw Error('Authentication/privilege boundary check failed');
for(const col of ['apmspans','logs']){const i=d.getCollection(col).getIndexes().find(i=>i.expireAfterSeconds!==undefined);if(!i)throw Error('TTL index missing');if(d.runCommand({collMod:col,index:{name:i.name,expireAfterSeconds:i.expireAfterSeconds}}).ok!==1)throw Error('Retention privilege missing');}
const report={retentionIndexUpdates:true,appCrud:true,unauthenticatedDenied:unauth,wrongPasswordDenied:badPassword,appAdministrationDenied:adminDenied,fixtureCollectionRemoved:!d.getCollectionNames().includes(name)};
fs.writeFileSync('/work/auth-verification.json',JSON.stringify(report),{mode:0o600});print(JSON.stringify(report));
