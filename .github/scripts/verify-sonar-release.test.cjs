const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verifyRelease } = require('./verify-sonar-release.cjs');
const { verifyAnalysis } = require('./verify-sonar-analysis.cjs');
const sha = 'a'.repeat(40);
const options = { repository: 'owner/kubiq', token: 'test-only', sha };
const validRun = { id: 1, head_sha: sha, head_branch: 'main', event: 'workflow_dispatch', status: 'completed', conclusion: 'success', repository: { full_name: options.repository } };
const respond = value => ({ ok: true, json: async () => value });
const verificationRun = { ...validRun, id: 2, run_number: 2, run_attempt: 1, event: 'push', status: 'in_progress', conclusion: null };
const verificationJob = { name: 'Verify application builds', head_sha: sha, status: 'completed', conclusion: 'success' };
const mockGitHub = ({ head = sha, run = validRun, proof = true, verificationRuns = [verificationRun], verificationJobs = [verificationJob] } = {}) => async url => {
  if (url.endsWith('/commits/main')) return respond({ sha: head });
  if (url.includes('/gcp-k3s.yml/runs?')) return respond({ workflow_runs: verificationRuns });
  if (url.includes('/jobs?')) return respond({ jobs: verificationJobs });
  if (url.includes('/artifacts?')) return respond({ artifacts: proof ? [{ name: `sonar-release-proof-${sha}`, expired: false }] : [] });
  return respond({ workflow_runs: [run] });
};
test('release permits only an exact main SHA with completed strict proof', async () => {
  assert.equal((await verifyRelease({ ...options, request: mockGitHub() })).sha, sha);
});
test('stale main, wrong repository, missing proof and unavailable GitHub block release', async () => {
  for (const request of [mockGitHub({ head: 'b'.repeat(40) }), mockGitHub({ proof: false }), mockGitHub({ run: { ...validRun, repository: { full_name: 'other/repo' } } }), async () => ({ ok: false, status: 503 })]) {
    await assert.rejects(verifyRelease({ ...options, request }));
  }
});

test('a passing Sonar scan cannot bypass missing, failed, pending or stale application verification', async () => {
  for (const state of [
    { verificationRuns: [] },
    { verificationJobs: [] },
    { verificationJobs: [{ ...verificationJob, conclusion: 'failure' }] },
    { verificationJobs: [{ ...verificationJob, status: 'in_progress', conclusion: null }] },
    { verificationJobs: [{ ...verificationJob, head_sha: 'b'.repeat(40) }] },
    { verificationRuns: [{ ...verificationRun, repository: { full_name: 'other/repo' } }] },
  ]) await assert.rejects(verifyRelease({ ...options, request: mockGitHub(state) }), /verification|lint, tests and builds/);
});

test('uses the latest verification run and permits its successful verify job while publishing is still running', async () => {
  const result = await verifyRelease({ ...options, request: mockGitHub() });
  assert.equal(result.verificationRunId, 2);
  const requests = [];
  const request = async url => {
    requests.push(url);
    if (url.includes('/gcp-k3s.yml/runs?')) return respond({ workflow_runs: [verificationRun, { ...verificationRun, id: 3, run_number: 3 }] });
    if (url.includes('/runs/3/jobs?')) return respond({ jobs: [{ ...verificationJob, conclusion: 'failure' }] });
    return mockGitHub()(url);
  };
  await assert.rejects(verifyRelease({ ...options, request }), /lint, tests and builds/);
  assert.ok(requests.some(url => url.includes('/runs/3/jobs?filter=latest')));
});

test('rechecks main after verification and proof reads', async () => {
  let headReads = 0;
  const request = async url => {
    if (url.endsWith('/commits/main') && ++headReads > 1) return respond({ sha: 'b'.repeat(40) });
    return mockGitHub()(url);
  };
  await assert.rejects(verifyRelease({ ...options, request }), /Main changed/);
});
const mockSonar = ({ revision = sha, open = 0, hotspots = 0, coverage = 20, newCoverage = 85, gate = 'OK' } = {}) => async url => {
  if (url.includes('project_analyses')) return respond({ analyses: [{ key: 'analysis', revision }] });
  if (url.includes('qualitygates')) return respond({ projectStatus: { status: gate } });
  if (url.includes('issues/search')) return respond({ paging: { total: open } });
  if (url.includes('hotspots/search')) return respond({ paging: { total: hotspots } });
  return respond({ component: { measures: [{ metric: 'coverage', value: String(coverage) }, { metric: 'new_lines_to_cover', period: { value: '10' } }, { metric: 'new_coverage', period: { value: String(newCoverage) } }, { metric: 'new_duplicated_lines_density', period: { value: '0' } }] } });
};
test('strict Sonar gate requires issues/hotspots resolved and measurable coverage', async () => {
  const args = { host: 'http://127.0.0.1:19000', token: 'test-only', sha, baseline: { coverage: 20 } };
  assert.equal((await verifyAnalysis({ ...args, request: mockSonar() })).issueCount, 0);
  for (const state of [{ revision: 'b'.repeat(40) }, { open: 1 }, { hotspots: 1 }, { coverage: 19 }, { newCoverage: 79 }, { gate: 'ERROR' }]) {
    await assert.rejects(verifyAnalysis({ ...args, request: mockSonar(state) }));
  }
  await assert.rejects(verifyAnalysis({ ...args, baseline: { coverage: null }, request: mockSonar() }));
});

test('denied verification identifies only the API path and never leaks its token', async () => {
  const token = 'test-secret-must-not-appear';
  await assert.rejects(verifyAnalysis({ host: 'http://127.0.0.1:19000', token, sha, baseline: { coverage: 20 }, request: async () => ({ ok: false, status: 403 }) }), error => {
    assert.equal(error.message, 'Sonar verification unavailable for /api/project_analyses/search (403).');
    assert.equal(error.message.includes(token), false);
    return true;
  });
});

test('CLI verification fails closed without the separate read token even when an analysis token exists', () => {
  const { spawnSync } = require('node:child_process');
  const path = require('node:path');
  const result = spawnSync(process.execPath, ['.github/scripts/verify-sonar-analysis.cjs'], {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, SONAR_HOST_URL: 'http://127.0.0.1:19000', GITHUB_SHA: sha, SONAR_READ_TOKEN: '', SONAR_TOKEN: 'test-analysis-only' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /read-only verification token/);
  assert.equal(result.stderr.includes('test-analysis-only'), false);
});

test('blocked analyses still check authenticated access to the measures endpoint', async () => {
  const paths = [];
  const request = async (url, options) => {
    paths.push(new URL(url).pathname);
    assert.equal(options.headers.Authorization, 'Bearer test-read-only');
    return mockSonar({ open: 1 })(url);
  };
  await assert.rejects(verifyAnalysis({ host: 'http://127.0.0.1:19000', token: 'test-read-only', sha, baseline: { coverage: 20 }, request }), /1 open issues/);
  assert.deepEqual(paths, ['/api/project_analyses/search', '/api/qualitygates/project_status', '/api/issues/search', '/api/hotspots/search', '/api/measures/component']);
});
