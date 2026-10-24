const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pinBaseline } = require('./pin-sonar-baseline.cjs');
const baseline = require('../../docs/sonarqube/new-code-baseline.json');
const args = { host: 'http://127.0.0.1:19000', adminToken: 'temporary-only', analysisToken: 'analysis-only', tokenName: 'kubiq-baseline-once-test' };

test('pins only the approved kubiq main analysis and revokes the temporary token', async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, ...options });
    return { ok: true, json: async () => ({ type: baseline.type, value: baseline.value, inherited: false }) };
  };
  assert.equal((await pinBaseline({ ...args, request })).analysisId, baseline.value);
  assert.deepEqual(Object.fromEntries(new URLSearchParams(calls[0].body)), { project: 'kubiq', branch: 'main', type: 'SPECIFIC_ANALYSIS', value: baseline.value });
  assert.equal(calls[1].headers.Authorization, 'Bearer analysis-only');
  assert.equal(new URL(calls[2].url).pathname, '/api/user_tokens/revoke');
  assert.equal(new URLSearchParams(calls[2].body).get('name'), args.tokenName);
});

test('revokes the temporary token even if setup or verification fails', async () => {
  for (const failSet of [true, false]) {
    const paths = [];
    const request = async url => {
      const path = new URL(url).pathname; paths.push(path);
      return { ok: !(failSet && path.endsWith('/set')), status: 403, json: async () => ({ type: 'PREVIOUS_VERSION' }) };
    };
    await assert.rejects(pinBaseline({ ...args, request }));
    assert.equal(paths.at(-1), '/api/user_tokens/revoke');
  }
});
