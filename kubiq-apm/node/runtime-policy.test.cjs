const assert = require('node:assert/strict');
const { test } = require('node:test');
const p = require('./runtime-policy');
test('request selection excludes noise and background sync, not business APIs or HTML', () => {
    for (const url of ['/health', '/kubiq/healthz', '/api/health/ready', '/assets/a.js', '/static/logo.png', '/api/logs/stream', '/api/k8s/live', '/kubiq-api/api/apm/services', '/kubiq-api/api/telemetry/logs']) assert.equal(p.excluded({ method: 'GET', url }, 'kubiq'), true, url);
    for (const url of ['/', '/index.html', '/api/services', '/api/github?repo=private']) assert.equal(p.excluded({ method: 'GET', url }, 'portfolio'), false, url);
    assert(p.excluded({ method: 'POST', url: '/api/codex-activity' }, 'portfolio'));
    assert(!p.excluded({ method: 'GET', url: '/api/codex-activity' }, 'portfolio'));
    assert.equal(p.pathOf({}), '/');
    assert.equal(p.pathOf({ url: 'http://[' }), '/');
});
test('only safe bounded attributes, normalized routes and error types are recorded', () => {
    assert.equal(p.method('GET'), 'GET'); assert.equal(p.method('SECRET'), 'OTHER');
    assert.deepEqual(p.attributes({ Authorization: 'secret', 'db.statement': 'secret', 'server.address': 'x'.repeat(300), 'http.response.status_code': 503, 'db.system': {} }), { 'server.address': 'x'.repeat(256), 'http.response.status_code': 503 });
    assert.deepEqual(p.attributes(), {});
    assert.equal(p.routeName({ url: '/secret?token=secret' }), '/*');
    assert.equal(p.routeName({ route: { path: '/items/:id' } }), '/items/:id');
    assert.equal(p.routeName({}, () => '/api/:id'), '/api/:id');
    for (const route of [1, 'private', '/?secret', '/'+ 'x'.repeat(201)]) assert.equal(p.routeName({}, () => route), '/*');
    assert.equal(p.errorType(new TypeError('secret')), 'TypeError');
    assert.equal(p.errorType({ name: 'secret' }), 'Error'); assert.equal(p.errorType(), 'Error');
});
