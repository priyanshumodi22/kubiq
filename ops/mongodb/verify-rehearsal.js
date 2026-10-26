const fs = require('fs'), crypto = require('crypto');
const source='/work/source/kubiq', target=process.env.VERIFY_TARGET_DIR||'/work/restored/kubiq';
const files=fs.readdirSync(source).filter(x=>x.endsWith('.bson')).sort();
const report={version:'8.0.34',database:'kubiq',rehearsal:process.env.VERIFY_KIND!=='backup-restore',backupRestore:process.env.VERIFY_KIND==='backup-restore',collections:[]};
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
for(const file of files){
 const a=fs.readFileSync(source+'/'+file),b=fs.readFileSync(target+'/'+file);
 const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
 if(hash(a)!==hash(b))throw Error('BSON comparison failed for '+file);
 let count=0,offset=0;while(offset<a.length){const len=a.readInt32LE(offset);if(len<5||offset+len>a.length)throw Error('Invalid BSON');offset+=len;count++;}
 const metadata=file.replace(/\.bson$/,'.metadata.json');
 const m=JSON.parse(fs.readFileSync(source+'/'+metadata)),n=JSON.parse(fs.readFileSync(target+'/'+metadata));
 const normalize=m=>({options:m.options||{},indexes:m.indexes.map(i=>({...i,key:Object.entries(i.key)})).sort((a,b)=>a.name.localeCompare(b.name))});
 if(JSON.stringify(stable(normalize(m)))!==JSON.stringify(stable(normalize(n))))throw Error('Index/options mismatch '+file);
 report.collections.push({name:file.slice(0,-5),documents:count,bsonSha256:hash(a),indexes:m.indexes.length});
}
if(files.length===0)throw Error('No BSON collections to verify');
report.totalDocuments=report.collections.reduce((n,c)=>n+c.documents,0);if(report.totalDocuments===0)throw Error('Unexpected empty database');report.passed=true;
fs.writeFileSync(process.env.VERIFY_REPORT||'/work/rehearsal-verification.json',JSON.stringify(report,null,2),{mode:0o600});print(JSON.stringify(report));
