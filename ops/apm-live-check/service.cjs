// Loaded after the unchanged kubiq-apm/auto preload. No fabricated OTLP payloads.
const http = require('node:http');
const { context, trace } = require('@opentelemetry/api');
const worker = process.env.CANARY_ROLE === 'worker';
const port = worker ? 18081 : 18080;

http.createServer((request, response) => {
  const span = trace.getSpan(context.active());
  span?.setAttribute('kubiq.validation.run_id', process.env.CANARY_RUN_ID);
  const traceId = span?.spanContext().traceId;
  const error = request.url === '/apm-validation/error';
  response.setHeader('Content-Type', 'application/json');
  if (worker) {
    setTimeout(() => {
      response.statusCode = error ? 503 : 200;
      response.end(JSON.stringify({ traceId, role: 'worker' }));
    }, request.url === '/apm-validation/slow' ? 120 : 15);
    return;
  }
  if (request.url === '/ready') {
    response.end('{}');
    return;
  }
  const downstream = http.get({ hostname: '127.0.0.1', port: 18081, path: request.url }, upstream => {
    let body = '';
    upstream.setEncoding('utf8');
    upstream.on('data', chunk => { body += chunk; });
    upstream.on('end', () => {
      response.statusCode = upstream.statusCode;
      const result = JSON.parse(body);
      response.end(JSON.stringify({ frontTraceId: traceId, workerTraceId: result.traceId, route: request.url }));
    });
  });
  downstream.setTimeout(3000, () => downstream.destroy(new Error('Canary downstream timeout')));
  downstream.on('error', () => {
    response.statusCode = 502;
    response.end(JSON.stringify({ error: 'Canary downstream unavailable' }));
  });
}).listen(port, worker ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(JSON.stringify({ event: 'listening', role: worker ? 'worker' : 'frontend', port }));
});
