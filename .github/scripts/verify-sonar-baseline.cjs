const fs = require('node:fs');
const baseline = require('../../docs/sonarqube/new-code-baseline.json');

async function verifyBaseline({ host, token, sha, request = fetch }) {
  if (!host || !token || !/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('Baseline endpoint, project analysis token and exact SHA are required.');
  const response = await request(`${host}/api/new_code_periods/show?project=kubiq&branch=main`, { redirect: 'error', headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Fixed baseline verification unavailable (${response.status}).`);
  const actual = await response.json();
  if (actual.projectKey !== baseline.project || actual.branchKey !== baseline.branch || actual.type !== baseline.type || actual.value !== baseline.value || (actual.inherited !== undefined && actual.inherited !== false)) throw new Error('Release blocked: new-code scope is not the approved fixed analysis.');
  return { sha, analysisId: baseline.value, revision: baseline.revision, type: baseline.type, checkedAt: new Date().toISOString() };
}

function readBaselineProof(sha, path = '.sonar-baseline-proof.json') {
  const proof = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (proof.sha !== sha || proof.analysisId !== baseline.value || proof.revision !== baseline.revision || proof.type !== baseline.type) throw new Error('Missing or stale fixed-baseline proof.');
  return proof;
}

module.exports = { verifyBaseline, readBaselineProof };
if (require.main === module) verifyBaseline({ host: process.env.SONAR_HOST_URL, token: process.env.SONAR_TOKEN, sha: process.env.GITHUB_SHA })
  .then(proof => fs.writeFileSync('.sonar-baseline-proof.json', JSON.stringify(proof, null, 2)))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
