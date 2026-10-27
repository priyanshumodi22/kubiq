// Runs only against the disposable database container owned by run.cjs.
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.env.COMPILED_BACKEND;
const kind = process.argv[2];
process.env.APM_RETENTION_PERIOD = '3d';
const services = ['request-metric-api', 'request-metric-legacy'];
async function repository() {
  if (kind === 'mongo') {
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.FIXTURE_MONGO_URI);
    const { MongoTraceRepository } = require(path.join(base, 'database/adapters/mongo/MongoTraceRepository'));
    return { trace: new MongoTraceRepository(), close: () => mongoose.disconnect() };
  }
  if (kind === 'clickhouse') {
    const { clickhouseService } = require(path.join(base, 'services/ClickhouseService'));
    await clickhouseService.initialize();
    const { ClickhouseTraceRepository } = require(path.join(base, 'database/adapters/clickhouse/ClickhouseTraceRepository'));
    return { trace: new ClickhouseTraceRepository(), close: () => clickhouseService.getClient().close() };
  }
  const { MysqlTraceRepository } = require(path.join(base, 'database/adapters/mysql/MysqlTraceRepository'));
  const trace = new MysqlTraceRepository();
  return { trace, close: () => trace.pool.end() };
}
(async () => {
  const { trace, close } = await repository();
  const { stopRetentionSweeps } = require(path.join(base, 'utils/RetentionScheduler'));
  try {
    await trace.initialize();
    stopRetentionSweeps();
    if (kind === 'mysql' || kind === 'mariadb') {
      const { mysqlTraceContext } = require(path.join(base, 'database/mysqlTraceContext'));
      const metadata = mysqlTraceContext(trace, 'traces', 'getServiceMetrics', kind);
      assert.equal(metadata['db.namespace'], process.env.DB_NAME);
      assert.equal(typeof metadata['server.port'], 'number');
      assert(!JSON.stringify(metadata).includes('password'));
    }
    const now = Date.now();
    let id = 0;
    const attributes = { 'db.system': 'mongodb', 'db.namespace': 'kubiq', 'db.collection.name': 'systempreferences', 'db.operation.name': 'getStorageConfig', 'server.address': 'mongodb.internal', 'server.port': 27017 };
    const span = (serviceName, kind, durationMs, statusCode) => ({ serviceName, kind, durationMs, statusCode, traceId: '1'.repeat(32), spanId: (++id).toString(16).padStart(16, '0'), name: 'fixture', attributes, startTimeUnixNano: now * 1e6, endTimeUnixNano: (now + durationMs) * 1e6 });
    await trace.insertSpans([
      span(services[0], 2, 10, 0), span(services[0], 'SPAN_KIND_SERVER', 30, 2),
      ...Array.from({ length: 9 }, () => span(services[0], 3, 1000, 2)),
      span(services[1], 'INTERNAL', 4, 0), span(services[1], 'INTERNAL', 8, 2),
    ]);
    const persisted = await trace.getTraceDetails('1'.repeat(32));
    assert.equal(persisted.length, 13);
    for (const row of persisted) assert.deepEqual(row.attributes, attributes, 'Storage must preserve all safe span attributes');
    const rows = await trace.getServiceMetrics(now - 1000, now + 2000);
    const api = rows.find(row => row.serviceName === services[0]);
    assert.deepEqual(api, { serviceName: services[0], requestCount: 2, errorCount: 1, avgDurationMs: 20, p95DurationMs: 30, measurementBasis: 'server-requests' });
    const legacy = rows.find(row => row.serviceName === services[1]);
    assert.equal(legacy.requestCount, 2);
    assert.equal(legacy.errorCount, 1);
    assert.equal(legacy.avgDurationMs, 6);
    assert.equal(legacy.measurementBasis, 'legacy-spans');
    assert(legacy.p95DurationMs >= 4 && legacy.p95DurationMs <= 8);
    assert.deepEqual(await trace.getServiceMetrics(0, 1), []);
    console.log(JSON.stringify({ passed: true, adapter: kind, tests: ['SERVER-only counts/errors/latency', 'numeric and named kinds', 'legacy fallback', 'empty window', 'attribute round trip'] }));
  } finally { stopRetentionSweeps(); await close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
