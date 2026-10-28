const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8'));
test('bundled backend and external production SDK share one pinned OpenTelemetry API', () => {
    const backend = read('backend/package.json'), runtime = read('telemetry/package.json');
    const version = runtime.dependencies['@opentelemetry/api'];
    assert.match(version, /^\d+\.\d+\.\d+$/);
    assert.equal(backend.dependencies['@opentelemetry/api'], version);
    for (const lock of ['backend/package-lock.json', 'telemetry/package-lock.json']) {
        const packages = read(lock).packages;
        assert.equal(packages[''].dependencies['@opentelemetry/api'], version);
        assert.equal(packages['node_modules/@opentelemetry/api'].version, version);
    }
    assert.match(backend.scripts['build:ncc'], /--external @opentelemetry\/api(?:\s|$)/);
    assert.match(backend.scripts['build:ncc'], /--external kubiq-apm\/runtime(?:\s|$)/);
});
