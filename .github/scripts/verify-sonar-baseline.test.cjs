const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verifyBaseline, readBaselineProof } = require('./verify-sonar-baseline.cjs');
const baseline = require('../../docs/sonarqube/new-code-baseline.json');
const sha = 'a'.repeat(40);
const args = { host: 'http://127.0.0.1:19000', token: 'analysis-only', sha };
const correct = { projectKey: 'kubiq', branchKey: 'main', type: baseline.type, value: baseline.value, inherited: false };
const response = value => async () => ({ ok: true, json: async () => value });

test('only the exact explicit baseline passes; rolling, inherited and denied scopes fail closed', async () => {
  assert.equal((await verifyBaseline({ ...args, request: response(correct) })).analysisId, baseline.value);
  const { inherited, ...omittedDefault } = correct;
  assert.equal((await verifyBaseline({ ...args, request: response(omittedDefault) })).analysisId, baseline.value);
  for (const actual of [{ ...correct, type: 'PREVIOUS_VERSION' }, { ...correct, inherited: true }, { ...correct, inherited: 'false' }, { ...correct, value: 'newer-analysis' }, { ...correct, branchKey: 'other' }, {}]) {
    await assert.rejects(verifyBaseline({ ...args, request: response(actual) }));
  }
  await assert.rejects(verifyBaseline({ ...args, request: async () => ({ ok: false, status: 403 }) }));
});

test('release proof must bind the fixed baseline to this exact commit', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kubiq-baseline-test-'));
  const file = path.join(directory, 'proof.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ sha, analysisId: baseline.value, revision: baseline.revision, type: baseline.type }));
    assert.equal(readBaselineProof(sha, file).sha, sha);
    assert.throws(() => readBaselineProof('b'.repeat(40), file));
    assert.throws(() => readBaselineProof(sha, path.join(directory, 'missing.json')));
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
});
