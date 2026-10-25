// A separate, uninstrumented HTTP client exercises the actual instrumented apps.
const http = require('node:http');
const assert = require('node:assert/strict');
const { setTimeout: pause } = require('node:timers/promises');

function request(path) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const req = http.get({ hostname: '127.0.0.1', port: 18080, path }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, elapsedMs: Math.round(performance.now() - started), ...JSON.parse(body) }); }
        catch (error) { reject(error); }
      });
    });
    req.setTimeout(3000, () => req.destroy(new Error('Canary request timeout')));
    req.on('error', reject);
  });
}

async function main() {
  let ready = false;
  for (let attempt = 0; attempt < 30 && !ready; attempt++) {
    try { await request('/ready'); ready = true; }
    catch { await pause(500); }
  }
  assert.ok(ready, 'Instrumented frontend did not start');
  for (const route of ['ok', 'slow', 'error', 'ok', 'slow', 'error']) {
    const result = await request('/apm-validation/' + route);
    assert.equal(result.status, route === 'error' ? 503 : 200);
    assert.match(result.frontTraceId, /^[a-f0-9]{32}$/);
    assert.equal(result.frontTraceId, result.workerTraceId, 'Distributed trace context was lost');
    if (route === 'slow') assert.ok(result.elapsedMs >= 100, 'Slow route did not perform its work');
    console.log(JSON.stringify({ event: 'verified-http-request', runId: process.env.CANARY_RUN_ID, ...result }));
  }
  // Give the normal SDK batch processor time to export before graceful shutdown.
  await pause(5000);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
