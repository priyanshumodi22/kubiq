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
      APM_ENABLED: 'true', KUBIQ_TRACING_ENABLED: String(enabled), KUBIQ_INGESTION_TOKEN: ingestionToken,
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
    const stream = await fetch(base + services + '/stream', { headers, signal: abort.signal });
    assert.equal(stream.status, 200);
    const reader = stream.body.getReader();
    await reader.read();
    abort.abort();
    await reader.cancel().catch(() => {});
    const spans = db.collection('apmspans');
    const serverQuery = { serviceName: 'kubiq-backend', kind: { $in: [2, '2', 'SERVER', 'SPAN_KIND_SERVER'] } };
    if (enabled) {
      for (let attempt = 0; attempt < 100 && await spans.countDocuments(serverQuery) < 4; attempt++) await pause(100);
      assert.equal(await spans.countDocuments(serverQuery), 4);
      const rows = await spans.find({ serviceName: 'kubiq-backend' }).toArray();
      const serverSpans = rows.filter(row => String(row.kind) === '2');
      const dependencies = rows.filter(row => String(row.kind) === '3');
      assert(dependencies.some(row => row.attributes['db.system'] === 'mongodb'));
      for (const dependency of dependencies) assert(serverSpans.some(parent => parent.spanId === dependency.parentSpanId && parent.traceId === dependency.traceId));
      assert(!JSON.stringify(rows).includes('SYNTHETIC_'));
      const metrics = await (await fetch(base + '/kubiq-api/api/apm/services', { headers })).json();
      const metric = metrics.find(row => row.serviceName === 'kubiq-backend');
      assert.equal(metric.measurementBasis, 'server-requests');
      assert.equal(metric.requestCount, 4);
      assert.equal(metric.errorCount, 0);
      const count = await spans.countDocuments({});
      await pause(4500);
      assert.equal(await spans.countDocuments({}), count, 'Background work/export/persistence must not feed back into tracing');
    } else assert.equal(await spans.countDocuments({}), 0);
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
    if (enabled) assert.equal(await spans.countDocuments(serverQuery), 5);
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
