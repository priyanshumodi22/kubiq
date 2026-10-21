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
  const runs = await get(`/actions/workflows/sonarqube.yml/runs?head_sha=${sha}&status=success&per_page=100`);
  const successful = (runs.workflow_runs || []).filter(run => run.head_sha === sha && run.head_branch === 'main' && run.event === 'workflow_dispatch' && run.status === 'completed' && run.conclusion === 'success' && run.repository?.full_name === repository);
  for (const run of successful) {
    const artifacts = await get(`/actions/runs/${run.id}/artifacts?per_page=100`);
    if ((artifacts.artifacts || []).some(artifact => !artifact.expired && artifact.name === `sonar-release-proof-${sha}`)) return { sha, runId: run.id };
  }
  throw new Error('No successful exact-commit Sonar analysis with an unexpired strict release proof exists.');
}

module.exports = { verifyRelease };
if (require.main === module) {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  verifyRelease({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN, sha })
    .then(result => console.log(`Verified Sonar release gate: ${result.sha}, run ${result.runId}`))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
