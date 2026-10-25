const http = require('node:http');
const { trace } = require('kubiq-apm');
const server = http.createServer((req,res) => {
 const span = trace.getActiveSpan();
 span?.setAttribute('kubiq.validation.run_id', process.env.CANARY_RUN_ID);
 const frontTraceId = span?.spanContext().traceId || '';
 http.get('http://127.0.0.1:18081'+req.url, upstream => {
  let body=''; upstream.on('data',chunk=>body+=chunk);
  upstream.on('end',()=>{res.writeHead(upstream.statusCode,{'content-type':'application/json'});res.end(JSON.stringify({...JSON.parse(body),frontTraceId}));});
 }).on('error',()=>{res.writeHead(502);res.end('{}');});
}).listen(18080,'0.0.0.0');
process.on('SIGTERM',()=>server.close());
