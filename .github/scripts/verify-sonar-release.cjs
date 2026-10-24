const { execFileSync } = require('node:child_process');

async function verifyRelease({ repository, sha, token, request = fetch }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '') || !/^[a-f0-9]{40}$/.test(sha || '') || !token) {
    throw new Error('Repository, exact commit SHA and GitHub token are required.');
  }
  const get = async path => {
    const response = await request(`https://api.github.com/repos/${repository}${path}`, {
      redirect: 'error', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!response.ok) throw new Error(`GitHub verification unavailable (${response.status}).`);
    return response.json();
  };
  const head = await get('/commits/main');
  if (head.sha !== sha) throw new Error('Release commit is no longer current main; scan the new main commit.');
  const verification = await get(`/actions/workflows/gcp-k3s.yml/runs?head_sha=${sha}&per_page=100`);
  const latestVerification = (verification.workflow_runs || [])
    .filter(run => run.head_sha === sha && run.head_branch === 'main' && ['push', 'workflow_dispatch'].includes(run.event) && run.repository?.full_name === repository)
    .sort((a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt)[0];
  if (!latestVerification) throw new Error('No exact-commit application verification run exists.');
  const jobs = await get(`/actions/runs/${latestVerification.id}/jobs?filter=latest&per_page=100`);
  const checks = (jobs.jobs || []).filter(job => job.name === 'Verify application builds');
  if (checks.length !== 1 || checks[0].head_sha !== sha || checks[0].status !== 'completed' || checks[0].conclusion !== 'success') {
    throw new Error('Release blocked: exact-commit application lint, tests and builds have not passed.');
  }
  const runs = await get(`/actions/workflows/sonarqube.yml/runs?head_sha=${sha}&status=success&per_page=100`);
  const successful = (runs.workflow_runs || []).filter(run => run.head_sha === sha && run.head_branch === 'main' && run.event === 'workflow_dispatch' && run.status === 'completed' && run.conclusion === 'success' && run.repository?.full_name === repository);
  for (const run of successful) {
    const artifacts = await get(`/actions/runs/${run.id}/artifacts?per_page=100`);
    if ((artifacts.artifacts || []).some(artifact => !artifact.expired && artifact.name === `sonar-release-proof-${sha}`)) {
      if ((await get('/commits/main')).sha !== sha) throw new Error('Main changed during release verification.');
      return { sha, runId: run.id, verificationRunId: latestVerification.id };
    }
  }
  throw new Error('No successful exact-commit Sonar analysis with an unexpired strict release proof exists.');
}

module.exports = { verifyRelease };
if (require.main === module) {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  verifyRelease({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN, sha })
    .then(result => console.log(`Verified release gates: ${result.sha}, Sonar run ${result.runId}, application verification ${result.verificationRunId}`))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
