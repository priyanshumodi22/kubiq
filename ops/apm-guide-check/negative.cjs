const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:3001/kubiq-api/api/apm/v1/traces';
(async () => {
 for (const [label, headers, expected] of [
  ['missing-token', {'Content-Type':'application/json'}, 401],
  ['wrong-token', {'Content-Type':'application/json', Authorization:'Bearer fixture-not-valid'}, 401],
  ['direct-protobuf', {'Content-Type':'application/x-protobuf', Authorization:'Bearer '+process.env.KUBIQ_INGESTION_TOKEN}, 415],
 ]) {
  const response = await fetch(base,{method:'POST',headers,body:headers['Content-Type']==='application/json'?'{"resourceSpans":[]}':''});
  assert.equal(response.status,expected,label);
  console.log(JSON.stringify({check:label,status:response.status}));
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
