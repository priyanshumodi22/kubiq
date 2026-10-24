const baseline = require('../../docs/sonarqube/new-code-baseline.json');

async function pinBaseline({ host, adminToken, analysisToken, tokenName, request = fetch }) {
  if (!host || !adminToken || !analysisToken || !/^kubiq-baseline-once-[\w-]+$/.test(tokenName || '')) throw new Error('Endpoint, temporary token, scanner token and exact temporary token name are required.');
  const call = async (path, token, body) => {
    const response = await request(host + path, {
      method: body ? 'POST' : 'GET', redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      ...(body ? { body: new URLSearchParams(body).toString() } : {}),
    });
    if (!response.ok) throw new Error(`Baseline operation failed for ${path.split('?')[0]} (${response.status}).`);
    return response;
  };
  try {
    await call('/api/new_code_periods/set', adminToken, { project: baseline.project, branch: baseline.branch, type: baseline.type, value: baseline.value });
    const response = await call('/api/new_code_periods/show?project=kubiq&branch=main', analysisToken);
    const actual = await response.json();
    if (actual.type !== baseline.type || actual.value !== baseline.value || actual.inherited !== false) throw new Error('Fixed Sonar baseline did not match the approved analysis.');
    return { project: baseline.project, branch: baseline.branch, type: actual.type, analysisId: actual.value };
  } finally {
    // No persistent administrator credential is retained by the workflow.
    await call('/api/user_tokens/revoke', adminToken, { name: tokenName });
  }
}

module.exports = { pinBaseline };
if (require.main === module) pinBaseline({ host: process.env.SONAR_HOST_URL, adminToken: process.env.SONAR_BASELINE_ADMIN_TOKEN, analysisToken: process.env.SONAR_TOKEN, tokenName: process.env.SONAR_BASELINE_TOKEN_NAME })
  .then(result => console.log(JSON.stringify({ ...result, temporaryTokenRevoked: true })))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
