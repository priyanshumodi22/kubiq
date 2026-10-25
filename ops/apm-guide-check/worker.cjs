const http = require('node:http');
const { trace } = require('kubiq-apm');
const server = http.createServer((req,res) => {
 const span = trace.getActiveSpan();
 span?.setAttribute('kubiq.validation.run_id', process.env.CANARY_RUN_ID);
 const id = span?.spanContext().traceId || '';
 const route = req.url.split('/').pop();
 setTimeout(() => {
  res.writeHead(route === 'error' ? 503 : 200, {'content-type':'application/json'});
  res.end(JSON.stringify({workerTraceId:id,runId:process.env.CANARY_RUN_ID}));
 }, route === 'slow' ? 120 : 0);
}).listen(18081,'0.0.0.0');
process.on('SIGTERM',()=>server.close());
