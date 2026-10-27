const fs = require('node:fs');

async function waitForExport({ host, token, sha, task, previous = false, request = fetch, attempts = 120, onPending = () => {}, pause = () => new Promise(resolve => setTimeout(resolve, 5000)) }) {
  if (!/^https?:\/\//.test(host || '') || !token || !/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('Exact revision and read-only Sonar authentication are required.');
  const statuses = {};
  const get = async path => {
    const response = await request(`${host}${path}`, { redirect: 'error', headers: { Authorization: `Bearer ${token}` } });
    statuses[path] = response.status;
    if ([401, 403].includes(response.status)) throw new Error('Export verification authentication denied.');
    return response.ok ? response.json() : null;
  };
  let expected;
  if (previous) {
    const result = await get('/api/project_analyses/search?project=kubiq&ps=1');
    if (!result || !Array.isArray(result.analyses)) throw new Error('Previous analysis is unavailable.');
    const analysis = result.analyses[0];
    if (!analysis) return { initialProject: true };
    expected = { analysisId: analysis.key, revision: analysis.revision };
  } else if (!/^[a-f0-9-]{36}$/.test(task || '')) throw new Error('A completed analysis task is required.');
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (!previous) {
      // Browse-only credentials can read project analyses; CE task inspection
      // may require analysis/admin rights, which the verifier must not receive.
      const result = await get('/api/project_analyses/search?project=kubiq&ps=1');
      const analysis = result?.analyses?.[0];
      expected = analysis?.revision === sha ? { analysisId: analysis.key, revision: sha, task } : undefined;
    }
    if (expected) {
      const receipt = await get('/_kubiq/sonar-export-status');
      if (receipt?.format === 3 && receipt.analysisId === expected.analysisId && receipt.revision === expected.revision && (!task || previous || receipt.task === task)) return receipt;
      if (attempt % 12 === 0) onPending({ previous, expected, receipt: receipt ? { format: receipt.format, analysisId: receipt.analysisId, revision: receipt.revision, task: receipt.task } : null, statuses });
    }
    if (attempt + 1 < attempts) await pause();
  }
  throw new Error('The exact analysis has not been preserved in Sheets and the archive; another scan or release remains blocked.');
}

module.exports = { waitForExport };
if (require.main === module) {
  const previous = process.argv.includes('--previous');
  Promise.resolve().then(async () => {
    const task = previous ? undefined : fs.readFileSync('.scannerwork/report-task.txt', 'utf8').split(/\r?\n/).find(line => line.startsWith('ceTaskId='))?.slice(9);
    const receipt = await waitForExport({ host: process.env.SONAR_HOST_URL, token: process.env.SONAR_READ_TOKEN, sha: process.env.GITHUB_SHA, task, previous, onPending: value => console.log('Export verification pending:', JSON.stringify(value)) });
    if (!previous) fs.writeFileSync('.sonar-export-proof.json', JSON.stringify(receipt, null, 2));
    console.log(previous ? 'Previous analysis export verified.' : 'Exact analysis export verified in Sheets and archive.');
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
