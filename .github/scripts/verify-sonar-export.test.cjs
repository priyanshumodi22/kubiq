const { test } = require('node:test');
const assert = require('node:assert/strict');
const { waitForExport } = require('./verify-sonar-export.cjs');
const sha = 'a'.repeat(40);
const task = 'ac87f101-0834-43a1-a03f-5de3cbcd5008';
const receipt = { format: 3, task, revision: sha, analysisId: 'analysis' };
const options = { host: 'http://localhost', token: 'fixture-read', sha, task, attempts: 2, pause: async () => {} };
const response = payload => ({ ok: true, status: 200, json: async () => payload });

test('waits for the exact task export even when the quality gate failed', async () => {
  let reads = 0;
  const request = async url => response(url.includes('project_analyses') ? { analyses: [{ key: 'analysis', revision: sha }] } : (++reads === 1 ? { ...receipt, task: 'old' } : receipt));
  assert.deepEqual(await waitForExport({ ...options, request }), receipt);
  assert.equal(reads, 2);
});

test('stale receipts, missing data, failed tasks and offline reporting fail closed', async () => {
  for (const stale of [null, { ...receipt, revision: 'b'.repeat(40) }, { ...receipt, analysisId: 'old' }]) {
    const request = async url => response(url.includes('project_analyses') ? { analyses: [{ key: 'analysis', revision: sha }] } : stale);
    await assert.rejects(waitForExport({ ...options, request }), /not been preserved/);
  }
  await assert.rejects(waitForExport({ ...options, request: async () => response({ analyses: [] }) }), /not been preserved/);
  await assert.rejects(waitForExport({ ...options, request: async () => ({ ok: false, status: 503 }) }), /not been preserved/);
});

test('a previous unexported analysis blocks the next scan and authentication is never bypassed', async () => {
  const request = async (url, config) => {
    assert.equal(config.headers.Authorization, 'Bearer fixture-read');
    return response(url.includes('project_analyses') ? { analyses: [{ key: 'analysis', revision: sha }] } : receipt);
  };
  assert.deepEqual(await waitForExport({ ...options, task: undefined, previous: true, request }), receipt);
  await assert.rejects(waitForExport({ ...options, request: async () => ({ status: 403, ok: false }) }), /authentication denied/);
});
