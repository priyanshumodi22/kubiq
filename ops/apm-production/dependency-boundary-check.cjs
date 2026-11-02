// Prove the scoped moderate-advisory assessment against the installed production SDK.
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createServer } = require('node:http');
const path = require('node:path');
const tree = process.argv[2] || 'backend';
assert(['backend', 'telemetry'].includes(tree));
const sdk = path.resolve(__dirname, '../../', tree, 'node_modules/kubiq-apm');
const runtime = require(path.join(sdk, 'runtime'));
const { getRuntime } = require(path.join(sdk, 'runtime-state'));
const payloads = [];
const receiver = createServer((req, res) => {
  let body = ''; req.on('data', chunk => { body += chunk; });
  req.on('end', () => { payloads.push(JSON.parse(body)); res.end('{}'); });
});

(async () => {
  await new Promise(resolve => receiver.listen(0, '127.0.0.1', resolve));
  let handle;
  try {
    handle = runtime.startTracing({ enabled: true, profile: 'kubiq', serviceName: 'dependency-boundary-fixture',
      endpoint: `http://127.0.0.1:${receiver.address().port}/v1/traces`, token: 'FIXTURE_TOKEN' });
    assert(handle.enabled);
    const headers = { traceparent: '00-11111111111111111111111111111111-2222222222222222-01' };
    for (const name of ['baggage', 'tracestate', 'authorization', 'uber-trace-id']) {
      Object.defineProperty(headers, name, { enumerable: true, get() { throw new Error(`Unexpected ${name} parsing`); } });
    }
    const response = Object.assign(new EventEmitter(), { statusCode: 200, writableFinished: true });
    runtime.traceRequest({ method: 'GET', url: '/fixture', headers }, response, () => {
      const api = getRuntime().api;
      assert.equal(api.propagation.getBaggage(api.context.active()), undefined);
      assert.deepEqual(api.propagation.fields().sort(), ['traceparent', 'tracestate']);
      assert.equal(runtime.traceDependency('mongodb.fixture', () => 'ok', { 'db.system': 'mongodb' }), 'ok');
    }, { route: () => '/fixture' });
    response.emit('finish'); await handle.forceFlush();
    const spans = payloads.flatMap(payload => payload.resourceSpans.flatMap(resource => resource.scopeSpans.flatMap(scope => scope.spans)));
    assert.equal(spans.length, 2);
    assert(spans.every(span => span.traceId === '11111111111111111111111111111111'));
    assert(spans.some(span => span.parentSpanId === '2222222222222222'));
    assert(!spans.some(span => span.attributes.some(attribute => attribute.key === 'db.user')));
    const loaded = Object.keys(require.cache).map(file => file.replaceAll('\\', '/'));
    assert(!loaded.some(file => /\/auto-instrumentations-node\//.test(file)));
    assert(!loaded.some(file => /\/instrumentation-(?:mongodb|mongoose|mysql|mysql2|pg|cassandra-driver|knex|tedious|redis)\//.test(file)));
    console.log(JSON.stringify({ tree, passed: true, checks: ['installed SDK', 'traceparent only', 'hostile baggage getter never read', 'no baggage propagator', 'no automatic database instrumentations', 'real parent/child export'] }));
  } finally {
    await handle?.shutdown(); await new Promise(resolve => receiver.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
