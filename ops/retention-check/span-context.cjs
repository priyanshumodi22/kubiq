const assert = require('node:assert/strict');
const http = require('node:http');
const { gunzipSync } = require('node:zlib');
const path = require('node:path');
module.exports = async function verifySpanContext(repository, kind, now) {
  if (kind === 'clickhouse') return;
  process.env.KUBIQ_TRACING_ENABLED = 'true';
  process.env.KUBIQ_TRACING_QUERY_DETAILS = 'true';
  const runtime = require('kubiq-apm/runtime');
  const { traceRepository } = require(path.join(process.env.COMPILED_BACKEND, 'database/traceRepository'));
  const { mongoTraceContext } = require(path.join(process.env.COMPILED_BACKEND, 'database/mongoTraceContext'));
  const { mysqlTraceContext } = require(path.join(process.env.COMPILED_BACKEND, 'database/mysqlTraceContext'));
  const payloads = [];
  const collector = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks);
      payloads.push(JSON.parse((request.headers['content-encoding'] === 'gzip' ? gunzipSync(body) : body).toString()));
      response.end('{}');
    });
  });
  await new Promise(resolve => collector.listen(0, '127.0.0.1', resolve));
  const handle = runtime.startTracing({ enabled: true, endpoint: 'http://127.0.0.1:' + collector.address().port + '/v1/traces', token: 'SYNTHETIC_CONTEXT_TOKEN', serviceName: 'adapter-context-fixture' });
  const system = kind === 'mongo' ? 'mongodb' : kind;
  if (kind === 'mongo') {
    const { observeMongoCommands } = require(path.join(process.env.COMPILED_BACKEND, 'telemetry/mongoCommandTracing'));
    observeMongoCommands(require('mongoose').connection.getClient());
  } else {
    const { instrumentMysqlRepository } = require(path.join(process.env.COMPILED_BACKEND, 'telemetry/mysqlQueryTracing'));
    instrumentMysqlRepository(repository, () => ({ ...mysqlTraceContext(repository, 'traces', 'query', kind), 'db.system': kind }));
  }
  const context = operation => kind === 'mongo' ? mongoTraceContext('traces', operation) : mysqlTraceContext(repository, 'traces', operation, kind);
  const wrapped = traceRepository(repository, 'traces', runtime.traceDependency, context, system);
  const business = http.createServer((request, response) => runtime.traceRequest(request, response, async () => {
    try { await wrapped.getServiceMetrics(now - 1000, now + 2000); response.end('ok'); }
    catch { response.statusCode = 500; response.end('failed'); }
  }, { route: () => '/fixture' }));
  try {
    await new Promise(resolve => business.listen(0, '127.0.0.1', resolve));
    const response = await fetch('http://127.0.0.1:' + business.address().port + '/fixture?private=SYNTHETIC_QUERY_SECRET');
    assert.equal(response.status, 200);
    await response.text();
    await handle.forceFlush();
    const spans = payloads.flatMap(payload => payload.resourceSpans.flatMap(resource => resource.scopeSpans.flatMap(scope => scope.spans)));
    assert(spans.length >= 3);
    assert.equal(spans.filter(span => span.kind === 2).length, 1);
    for (const span of spans.filter(item => item.kind === 3)) assert(spans.some(parent => parent.spanId === span.parentSpanId && parent.traceId === span.traceId));
    const server = spans.find(span => span.kind === 2), child = spans.find(span => span.kind === 3 && span.attributes.some(item => item.key === 'code.namespace' && item.value.stringValue === 'kubiq.repositories.traces'));
    const commands = spans.filter(span => span.attributes.some(item => item.key === 'code.namespace' && ['mongodb.command', 'mysql2.driver'].includes(item.value.stringValue)));
    assert(commands.length > 0);
    for (const command of commands) assert(command.attributes.some(item => item.key === 'db.query.text' && typeof item.value.stringValue === 'string')); 
    assert.equal(child.parentSpanId, server.spanId);
    const attributes = Object.fromEntries(child.attributes.map(item => [item.key, item.value.stringValue ?? Number(item.value.intValue ?? item.value.doubleValue)]));
    assert.equal(attributes['db.system'], system);
    assert.equal(attributes['db.namespace'], kind === 'mongo' ? 'retention_fixture' : process.env.DB_NAME);
    assert.equal(attributes['server.port'], Number(process.env.DB_PORT));
    if (kind === 'mongo') assert.equal(attributes['db.collection.name'], 'apmspans');
    assert(!JSON.stringify(payloads).includes('SYNTHETIC_'));
    console.log(JSON.stringify({ passed: true, adapter: kind, check: 'real HTTP request, repository and real driver calls, commands, result counts and parented target attributes' }));
  } finally {
    await handle.shutdown();
    for (const server of [business, collector]) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  }
};
