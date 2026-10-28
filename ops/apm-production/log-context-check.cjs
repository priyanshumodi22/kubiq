// Real SDK context and compiled application logger, without production databases.
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createServer } = require('node:http');
const runtime = require('../../backend/node_modules/kubiq-apm/runtime');
const { requestCompletionLog } = require('../../backend/dist/middleware/requestCompletionLog');
const { withRequestLogScope, logApplicationEvent } = require('../../backend/dist/telemetry/correlatedLogger');
const { DatabaseFactory } = require('../../backend/dist/database/DatabaseFactory');
const { IngestionBufferService } = require('../../backend/dist/services/IngestionBufferService');
const retained = [], output = [], payloads = [];
const receiver = createServer((req, res) => {
    let body = ''; req.on('data', chunk => { body += chunk; });
    req.on('end', () => { payloads.push(JSON.parse(body)); res.end('{}'); });
});
(async () => {
    await new Promise(resolve => receiver.listen(0, '127.0.0.1', resolve));
    const info = console.info; let handle;
    try {
        console.info = line => { output.push(JSON.parse(line)); };
        DatabaseFactory.isLogStorageSupported = () => true;
        IngestionBufferService.getInstance = () => ({ addLogs: rows => { retained.push(...rows); return true; } });
        handle = runtime.startTracing({ enabled: true, profile: 'kubiq', serviceName: 'kubiq-backend', endpoint: 'http://127.0.0.1:' + receiver.address().port + '/v1/traces', token: 'SYNTHETIC_LOG_FIXTURE_SECRET' });
        assert(handle.enabled);
        const request = { method: 'GET', url: '/api/users/private?secret=SYNTHETIC_LOG_FIXTURE_SECRET', headers: { authorization: 'SYNTHETIC_LOG_FIXTURE_SECRET' } };
        const response = Object.assign(new EventEmitter(), { statusCode: 200, writableFinished: true });
        let delayed;
        runtime.traceRequest(request, response, () => withRequestLogScope(response, () => {
            requestCompletionLog(request, response, () => '/api/users/:id');
            assert.equal(runtime.traceDependency('mongodb.fixture', () => { logApplicationEvent('fixture_completed'); return 7; }, { 'db.system': 'mongodb' }), 7);
            delayed = new Promise(resolve => setImmediate(() => { logApplicationEvent('background_finished'); resolve(); }));
        }), { route: () => '/api/users/:id' });
        response.emit('finish'); response.emit('close'); await delayed; await handle.forceFlush();
        const spans = payloads.flatMap(payload => payload.resourceSpans.flatMap(resource => resource.scopeSpans.flatMap(scope => scope.spans)));
        assert.equal(retained.length, 2);
        for (const log of retained) {
            const event = JSON.parse(log.message);
            const span = spans.find(row => row.traceId === event.trace_id && row.spanId === event.span_id);
            assert(span, 'A real exported span must own each correlated event');
            assert(output.some(row => row.event_id === event.event_id));
            assert.equal(Number(span.kind), event.event === 'fixture_completed' ? 3 : 2);
        }
        const background = output.find(event => event.event === 'background_finished');
        assert(background && !background.trace_id && !background.span_id, 'Delayed work must not inherit completed request context');
        assert(!JSON.stringify([...retained, ...output, ...payloads]).includes('SYNTHETIC_LOG_FIXTURE_SECRET'));
        assert.equal(response.listenerCount('close'), 0);
    } finally {
        console.info = info; await handle?.shutdown(); await new Promise(resolve => receiver.close(resolve));
    }
    console.log(JSON.stringify({ passed: true, tests: ['actual SERVER/child span IDs', 'same stdout/retained event', 'no stale background context', 'secret exclusion', 'listener cleanup'] }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
