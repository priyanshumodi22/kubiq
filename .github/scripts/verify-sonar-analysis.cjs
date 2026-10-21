const fs = require('node:fs');

async function verifyAnalysis({ host, token, sha, request = fetch, baseline }) {
  if (!/^https?:\/\//.test(host || '') || !token || !/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('Sonar endpoint, token and exact revision are required.');
  const get = async path => {
    const response = await request(`${host}${path}`, { redirect: 'error', headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Sonar verification unavailable (${response.status}).`);
    return response.json();
  };
  const analysis = (await get('/api/project_analyses/search?project=kubiq&ps=1')).analyses?.[0];
  if (!analysis?.key || analysis.revision !== sha) throw new Error('Latest Sonar analysis does not match the release revision.');
  const gate = await get(`/api/qualitygates/project_status?analysisId=${encodeURIComponent(analysis.key)}`);
  const issues = await get('/api/issues/search?componentKeys=kubiq&issueStatuses=OPEN,CONFIRMED&ps=1');
  const hotspots = await get('/api/hotspots/search?projectKey=kubiq&status=TO_REVIEW&ps=1');
  const issueCount = issues.paging?.total ?? issues.total;
  const hotspotCount = hotspots.paging?.total;
  if (issueCount !== 0 || hotspotCount !== 0 || gate.projectStatus?.status !== 'OK') throw new Error(`Release blocked: ${issueCount ?? 'unknown'} open issues, ${hotspotCount ?? 'unknown'} unreviewed hotspots, gate ${gate.projectStatus?.status || 'unknown'}.`);
  const payload = await get('/api/measures/component?component=kubiq&metricKeys=coverage,new_coverage,new_lines_to_cover,new_duplicated_lines_density');
  const measures = Object.fromEntries((payload.component?.measures || []).map(item => [item.metric, Number(item.value ?? item.period?.value ?? item.periods?.[0]?.value)]));
  if (!Number.isFinite(measures.coverage) || !Number.isFinite(baseline?.coverage)) throw new Error('Measured overall coverage and a reviewed coverage baseline are required.');
  if (measures.coverage + 0.01 < baseline.coverage) throw new Error('Overall coverage regressed against the reviewed baseline.');
  if (!Number.isFinite(measures.new_lines_to_cover)) throw new Error('New-code coverage scope is missing; configure the fixed new-code baseline.');
  if (measures.new_lines_to_cover > 0 && (!Number.isFinite(measures.new_coverage) || measures.new_coverage < 80)) throw new Error('New-code coverage must be at least 80%.');
  if (Number.isFinite(measures.new_duplicated_lines_density) && measures.new_duplicated_lines_density > 3) throw new Error('New-code duplication exceeds 3%.');
  return { sha, analysisId: analysis.key, qualityGate: 'OK', issueCount, hotspotCount, measures, checkedAt: new Date().toISOString() };
}

module.exports = { verifyAnalysis };
if (require.main === module) {
  verifyAnalysis({ host: process.env.SONAR_HOST_URL, token: process.env.SONAR_TOKEN, sha: process.env.GITHUB_SHA, baseline: JSON.parse(fs.readFileSync('docs/sonarqube/coverage-baseline.json', 'utf8')) })
    .then(proof => fs.writeFileSync('.sonar-release-proof.json', JSON.stringify(proof, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
