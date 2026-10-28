// Real production image, disposable authenticated MongoDB, synthetic credentials only.
const assert = require('node:assert/strict');
const { execFileSync, spawn, execFile } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { MongoClient, ObjectId } = require('../../backend/node_modules/mongoose').mongo;
const bcrypt = require('../../backend/node_modules/bcryptjs');
const jwt = require('../../backend/node_modules/jsonwebtoken');
const image = process.env.KUBIQ_IMAGE;
assert(image, 'KUBIQ_IMAGE must identify the actual image under verification');
const docker = args => execFileSync('docker', args, { encoding: 'utf8' }).trim();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const prefix = 'kubiq-image-' + process.pid;
const mongoName = prefix + '-mongo';
const jwtSecret = 'SYNTHETIC_JWT_SECRET_FOR_DISPOSABLE_IMAGE_CHECK';
const ingestionToken = 'SYNTHETIC_INGESTION_SECRET';
async function availablePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function check(enabled, mongoPort) {
  const name = prefix + '-' + Number(enabled);
  const port = await availablePort();
  const database = 'apm_image_' + Number(enabled);
  const uri = 'mongodb://fixture:SYNTHETIC_DB_SECRET@127.0.0.1:' + mongoPort + '/' + database + '?authSource=admin';
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 1000 });
  let logs = '', child;
  try {
    await client.connect();
    const db = client.db(database);
    const admin = new ObjectId(), viewer = new ObjectId();
    await db.collection('users').insertMany([
      { _id: admin, username: 'fixture-admin', password: bcrypt.hashSync('SYNTHETIC_LOGIN_SECRET', 4), enabled: true, role: 'kubiq-admin', roles: ['kubiq-admin'] },
      { _id: viewer, username: 'fixture-viewer', password: 'unused-fixture-hash', enabled: true, role: 'kubiq-viewer', roles: ['kubiq-viewer'] },
    ]);
    const environment = { PORT: String(port), NODE_ENV: 'production', DB_TYPE: 'mongo', DB_URI: uri,
      BACKEND_CONTEXT_PATH: '/kubiq-api', FRONTEND_CONTEXT_PATH: '/kubiq', KUBIQ_LOAD_DOTENV: 'false',
      NATIVE_AUTH_ENABLED: 'true', KEYCLOAK_ENABLED: 'false', JWT_SECRET: jwtSecret,
      APM_ENABLED: 'true', KUBIQ_TRACING_QUERY_DETAILS: 'true', KUBIQ_TRACING_ENABLED: String(enabled), KUBIQ_INGESTION_TOKEN: ingestionToken,
      OTEL_PROPAGATORS: 'jaeger', OTEL_TRACES_SAMPLER: 'always_off',
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://127.0.0.1:' + port + '/kubiq-api/api/apm/v1/traces',
      APM_RETENTION_PERIOD: '3d', LOG_RETENTION_PERIOD: '7d', SYSTEM_METRICS_ENABLED: 'false', K8S_METRICS_HISTORY_ENABLED: 'false', K8S_TERMINAL_ENABLED: 'false',
    };
    child = spawn('docker', ['run', '--rm', '--name', name, '--network', 'host', '--memory', '512m', '--memory-swap', '512m', '--cpus', '0.4', ...Object.entries(environment).flatMap(([key, value]) => ['-e', key + '=' + value]), image], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { logs += data; });
    child.stderr.on('data', data => { logs += data; });
    const base = 'http://127.0.0.1:' + port;
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      if (child.exitCode !== null) throw new Error('Image exited before readiness');
      try { if ((await fetch(base + '/health')).ok) { ready = true; break; } } catch { /* Startup probe. */ }
      await pause(100);
    }
    assert(ready, 'Image did not become ready within twenty seconds');
    console.log(JSON.stringify({ stage: 'ready', tracing: enabled }));
    const login = await fetch(base + '/kubiq-api/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'fixture-admin', password: 'SYNTHETIC_LOGIN_SECRET' }) });
    assert.equal(login.status, 200);
    const token = (await login.json()).token;
    assert(token);
    const headers = { Authorization: 'Bearer ' + token };
    const services = '/kubiq-api/api/services';
    assert.equal((await fetch(base + services + '?secret=SYNTHETIC_QUERY_SECRET', { headers: { ...headers, 'uber-trace-id': '%', baggage: 'secret=SYNTHETIC_BAGGAGE_SECRET' } })).status, 200);
    assert.equal((await fetch(base + services, { headers: { Authorization: 'Bearer invalid' } })).status, 401);
    const viewerToken = jwt.sign({ sub: viewer.toHexString(), type: 'native' }, jwtSecret);
    assert.equal((await fetch(base + services, { method: 'POST', headers: { Authorization: 'Bearer ' + viewerToken, 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await fetch(base + '/kubiq-api/api/apm/v1/traces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    await (await fetch(base + '/kubiq/assets/fixture.js')).text();
    const abort = new AbortController();
    const streamDeadline = setTimeout(() => abort.abort(), 5000);
    const stream = await fetch(base + services + '/stream', { headers, signal: abort.signal });
    assert.equal(stream.status, 200);
    const reader = stream.body.getReader();
    await reader.read();
    clearTimeout(streamDeadline);
    abort.abort();
    await reader.cancel().catch(() => {});
    console.log(JSON.stringify({ stage: 'stream-delivered', tracing: enabled }));
    assert.equal((await fetch(base + '/kubiq-api/api/users/' + viewer.toHexString() + '/password', { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'SYNTHETIC_RESET_PASSWORD' }) })).status, 200);
    const spans = db.collection('apmspans');
    const serverQuery = { serviceName: 'kubiq-backend', kind: { $in: [2, '2', 'SERVER', 'SPAN_KIND_SERVER'] } };
    if (enabled) {
      for (let attempt = 0; attempt < 100 && await spans.countDocuments(serverQuery) < 5; attempt++) await pause(100);
      assert.equal(await spans.countDocuments(serverQuery), 5);
      const rows = await spans.find({ serviceName: 'kubiq-backend' }).toArray();
      const dependencies = rows.filter(row => String(row.kind) === '3');
      assert(dependencies.some(row => row.attributes['db.system'] === 'mongodb'));
      for (const row of dependencies.filter(item => item.attributes['db.system'] === 'mongodb')) {
        assert.equal(row.attributes['db.namespace'], database);
        assert.equal(row.attributes['server.port'], Number(mongoPort));
        assert.equal(typeof row.attributes['db.collection.name'], 'string');
        assert.equal(row.attributes['code.function.name'], row.attributes['db.operation.name']);
      }
      for (const dependency of dependencies) assert(rows.some(parent => parent.spanId === dependency.parentSpanId && parent.traceId === dependency.traceId));
      assert(!JSON.stringify(rows).includes('SYNTHETIC_'));
      const commands = dependencies.filter(row => row.attributes['code.namespace'] === 'mongodb.command');
      assert(commands.some(row => typeof row.attributes['db.query.text'] === 'string'));
      assert(commands.some(row => String(row.attributes['db.query.text']).includes('[REDACTED]')));
      const changed = await db.collection('users').findOne({ _id: viewer });
      assert(changed.password && !JSON.stringify(rows).includes(changed.password), 'Stored password hash must not leak through command monitoring');
      const metrics = await (await fetch(base + '/kubiq-api/api/apm/services', { headers })).json();
      const metric = metrics.find(row => row.serviceName === 'kubiq-backend');
      assert.equal(metric.measurementBasis, 'server-requests');
      assert.equal(metric.requestCount, 5);
      assert.equal(metric.errorCount, 0);
      const completion = db.collection('logs');
      for (let attempt = 0; attempt < 100 && await completion.countDocuments({ sourceName: 'http-requests' }) < 5; attempt++) await pause(100);
      const requestLogs = await completion.find({ sourceName: 'http-requests' }).toArray();
      assert.equal(requestLogs.length, 5, 'Exactly one completion log per eligible request');
      for (const log of requestLogs) {
        const event = JSON.parse(log.message);
        const parent = rows.find(row => row.traceId === event.trace_id && row.spanId === event.span_id);
        assert(parent && String(parent.kind) === '2', 'Bundled backend must share SDK active SERVER context');
        assert.equal(log.traceId, event.trace_id);
        assert.equal(event.event, 'http_request_completed');
        assert(logs.includes(log.message), 'The same correlated event must be visible in actual container stdout');
        assert.equal(log.spanId, event.span_id);
        assert.equal(event.route, parent.attributes['http.route']);
        assert(!JSON.stringify(log).includes('SYNTHETIC_'), 'Correlation logs must exclude secrets');
      }
      const target = requestLogs[0];
      const correlated = await fetch(base + '/kubiq-api/api/logs/trace/' + target.traceId, { headers });
      assert.equal(correlated.status, 200);
      const found = await correlated.json();
      assert(found.logs.some(row => row.traceId === target.traceId));
      const exact = await (await fetch(base + '/kubiq-api/api/logs/trace/' + target.traceId + '?spanId=' + target.spanId, { headers })).json();
      assert(exact.logs.some(row => row.spanId === target.spanId));
      const absent = await (await fetch(base + '/kubiq-api/api/logs/trace/' + target.traceId + '?spanId=ffffffffffffffff', { headers })).json();
      assert.equal(absent.logs.length, 0, 'No unrelated-span logs may be substituted');
      assert.equal((await fetch(base + '/kubiq-api/api/logs/trace/' + target.traceId, { headers: { Authorization: 'Bearer invalid' } })).status, 401);
      const completionCount = await completion.countDocuments({ sourceName: 'http-requests' });
      const count = await spans.countDocuments({});
      await pause(4500);
      assert.equal(await spans.countDocuments({}), count, 'Background work/export/persistence must not feed back into tracing');
      assert.equal(await completion.countDocuments({ sourceName: 'http-requests' }), completionCount, 'Trace-log lookups must not create more correlation logs');
    } else {
      assert.equal(await spans.countDocuments({}), 0);
      // Disabling the producer must leave authenticated ingestion and analytics operational.
      const nanos = BigInt(Date.now()) * 1000000n;
      const fixtureName = 'image-ingestion-fixture';
      const payload = { resourceSpans: [{ resource: { attributes: [{ key: 'service.name', value: { stringValue: fixtureName } }] }, scopeSpans: [{ spans: [{ traceId: '0123456789abcdef0123456789abcdef', spanId: '0123456789abcdef', name: 'fixture', kind: 1, startTimeUnixNano: String(nanos), endTimeUnixNano: String(nanos + 1000000n), status: { code: 0 } }] }] }] };
      assert.equal((await fetch(base + '/kubiq-api/api/apm/v1/traces', { method: 'POST', headers: { Authorization: 'Bearer ' + ingestionToken, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).status, 202);
      for (let attempt = 0; attempt < 60 && await spans.countDocuments({ serviceName: fixtureName }) === 0; attempt++) await pause(100);
      assert.equal(await spans.countDocuments({ serviceName: fixtureName }), 1);
      const metrics = await (await fetch(base + '/kubiq-api/api/apm/services', { headers })).json();
      const metric = metrics.find(row => row.serviceName === fixtureName);
      assert.equal(metric.requestCount, 1);
      assert.equal(metric.measurementBasis, 'legacy-spans');
      await spans.deleteMany({ serviceName: fixtureName }); // Only this disposable CI database.
      assert.equal(await spans.countDocuments({}), 0);
    }
    const indexes = await spans.listIndexes().toArray();
    assert.equal(indexes.find(index => index.key.timestamp === 1 && Object.keys(index.key).length === 1).expireAfterSeconds, 259200);
    const peak = Number(docker(['exec', name, 'cat', '/sys/fs/cgroup/memory.peak']));
    const inspection = JSON.parse(docker(['inspect', name]))[0];
    assert.equal(inspection.State.OOMKilled, false);
    assert.equal(inspection.RestartCount, 0);
    await (await fetch(base + services, { headers })).text();
    const exited = once(child, 'exit');
    await new Promise((resolve, reject) => execFile('docker', ['stop', '--time', '6', name], error => error ? reject(error) : resolve()));
    const [code] = await exited;
    assert.equal(code, 0, 'Final loopback export must persist before bounded shutdown completes');
    if (enabled) assert.equal(await spans.countDocuments(serverQuery), 6);
    assert(!logs.includes('SYNTHETIC_'), 'Application diagnostics leaked a fixture credential or query');
    console.log(JSON.stringify({ passed: true, tracing: enabled, image, memoryPeakBytes: peak, limitMiB: 512, tests: ['bundled runtime', 'native login', 'RBAC denial', 'MongoDB children', 'request metrics', 'noise suppression', 'TTL', 'shutdown drain', 'private diagnostics'] }));
  } catch (error) {
    // The fixture log may explain a failed build, but never emit credentials or request bodies.
    console.error(logs.split('\n').filter(line => !line.includes('SYNTHETIC_')).slice(-20).join('\n'));
    throw error;
  } finally {
    if (child?.exitCode === null) { try { docker(['rm', '-f', name]); } catch { /* Already removed. */ } }
    await client.close();
  }
}
(async () => {
  try {
    docker(['run', '-d', '--rm', '--name', mongoName, '--memory', '768m', '--memory-swap', '768m', '--cpus', '0.5', '-p', '127.0.0.1::27017', '-e', 'MONGO_INITDB_ROOT_USERNAME=fixture', '-e', 'MONGO_INITDB_ROOT_PASSWORD=SYNTHETIC_DB_SECRET', '-e', 'GLIBC_TUNABLES=glibc.pthread.rseq=1', 'mongo:8.0.34', '--wiredTigerCacheSizeGB', '0.25']);
    const port = JSON.parse(docker(['inspect', mongoName]))[0].NetworkSettings.Ports['27017/tcp'][0].HostPort;
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      const probe = new MongoClient('mongodb://fixture:SYNTHETIC_DB_SECRET@127.0.0.1:' + port + '/admin', { serverSelectionTimeoutMS: 500 });
      try { await probe.connect(); ready = true; break; } catch { await pause(250); } finally { await probe.close(); }
    }
    assert(ready, 'Disposable authenticated MongoDB did not start');
    await check(false, port);
    await check(true, port);
  } finally { try { docker(['rm', '-f', '-v', mongoName]); } catch { /* Already removed. */ } }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
