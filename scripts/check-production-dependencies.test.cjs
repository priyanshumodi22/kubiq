const { test } = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../release/dependency-assessment.json');
const { assess } = require('./check-production-dependencies.cjs');
const fs = require('node:fs');
const path = require('node:path');
const id = 'GHSA-8988-4f7v-96qf';
const advisory = { url: `https://github.com/advisories/${id}`, severity: 'moderate' };
const fixture = () => ({ metadata: { vulnerabilities: { total: 2 } }, vulnerabilities: {
  sdk: { severity: 'moderate', via: ['@opentelemetry/core'] },
  '@opentelemetry/core': { severity: 'moderate', via: [{ ...advisory }] },
} });
const options = { root: 'backend', sdkVersion: '1.1.1', policy, now: new Date('2026-11-02') };

test('reviewed transitive findings remain visible and have an expiry', () => {
  assert.deepEqual(assess(fixture(), options).scopedAdvisories, [id]);
  assert.equal(assess(fixture(), options).graphFindings, 2);
});
test('unknown findings, higher severities and changed scopes fail closed', () => {
  for (const change of [
    report => { report.vulnerabilities.sdk.severity = 'high'; },
    report => { report.vulnerabilities['@opentelemetry/core'].via[0].severity = 'critical'; },
    report => { report.vulnerabilities['@opentelemetry/core'].via[0].url = 'https://github.com/advisories/GHSA-unknown'; },
    report => { report.vulnerabilities['@opentelemetry/core'].via[0].url = `https://untrusted.example/${id}`; },
    report => { report.vulnerabilities.sdk.via = ['missing']; },
    report => { report.vulnerabilities.sdk.via = ['sdk']; },
  ]) { const report = fixture(); change(report); assert.throws(() => assess(report, options)); }
  for (const override of [{ root: 'frontend' }, { sdkVersion: '1.1.2' }, { now: new Date('2026-12-02') }]) {
    assert.throws(() => assess(fixture(), { ...options, ...override }));
  }
  assert.throws(() => assess(fixture(), { ...options, policy: { ...policy, reviewBefore: 'invalid' } }));
});
test('a clean report passes; unavailable or incomplete reports do not', () => {
  assert.equal(assess({ metadata: { vulnerabilities: { total: 0 } }, vulnerabilities: {} }, options).graphFindings, 0);
  assert.throws(() => assess({ error: { message: 'Offline' } }, options));
  assert.throws(() => assess({ metadata: { vulnerabilities: { total: 2 } }, vulnerabilities: {} }, options));
  assert.throws(() => assess({ metadata: { vulnerabilities: {} }, vulnerabilities: {} }, options));
});

test('application launchers retain the assessed tracing entry point', () => {
  const read = name => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');
  const stages = read('Dockerfile').split('\n').filter(line => line.startsWith('FROM '));
  assert.equal(stages.length, 4);
  assert(stages.every(line => line.startsWith('FROM node:22-bookworm-slim')));
  assert.match(read('Dockerfile'), /CMD \["node", "--require", "\.\/telemetry\/bootstrap\.js", "index\.js"\]/);
  assert.match(read('backend/src/telemetry/bootstrap.ts'), /from 'kubiq-apm\/runtime'/);
  assert.doesNotMatch(read('backend/src/telemetry/bootstrap.ts'), /kubiq-apm\/auto/);
  assert.match(read('scripts/package-linux.cjs'), /--require .\/telemetry\/bootstrap\.js .\/index\.js/);
});
