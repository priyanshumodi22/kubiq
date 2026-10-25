const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const sdkRequire = createRequire(path.resolve(process.env.KUBIQ_TEST_PACKAGE_ROOT || 'kubiq-apm/node/package.json'));
const { KubiqExporter } = sdkRequire('./exporter');
const { NodeTracerProvider } = sdkRequire('@opentelemetry/sdk-trace-node');

test('real exporter serializes JSON, authenticates, and reports denied and unavailable receivers', async () => {
 const observed = [];
 const server = http.createServer((request, response) => {
  let body = '';
  request.on('data', chunk => body += chunk);
  request.on('end', () => {
   observed.push({auth:request.headers.authorization, body:JSON.parse(body)});
   response.writeHead(401); response.end('Unauthorized');
  });
 });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const port = server.address().port;
 const provider = new NodeTracerProvider();
 const span = provider.getTracer('kubiq-export-failure').startSpan('real-delivery-check');
 span.end();
 const exporter = new KubiqExporter({url:'http://127.0.0.1:'+port+'/v1/traces',headers:{Authorization:'Bearer fixture-only'},timeoutMillis:500});
 try {
  const denied = await new Promise(resolve => exporter.export([span],resolve));
  assert.equal(denied.code,1);
  assert.equal(observed[0].auth,'Bearer fixture-only');
  assert.equal(observed[0].body.resourceSpans.length,1);
  assert.ok(!String(denied.error).includes('Bearer fixture-only'));
  await new Promise(resolve => server.close(resolve));
  const unavailable = await new Promise(resolve => exporter.export([span],resolve));
  assert.equal(unavailable.code,1,'An offline receiver must not report successful delivery');
 } finally {
  if (server.listening) await new Promise(resolve => server.close(resolve));
  await exporter.shutdown();
  await provider.shutdown();
 }
});
