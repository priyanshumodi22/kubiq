const assert = require('node:assert/strict');
const fs = require('node:fs');
const ledger = require('../docs/sonarqube/baseline-ledger.json');

// Consume an archived export, never infer a closure from a source edit or absence.
const report = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
assert.equal(report.schemaVersion, 3);
assert.match(report.metadata.revision, /^[a-f0-9]{40}$/);
const verifiedRevisions = {
  '2f73b35e24211b5c55d4f25afba7f39212c9ce68': [147, 21],
  '29644d8e65d2f619a90742638a96a7e8a98781eb': [163, 27],
  '675dbef75e050f6602b49e40a2d62f4bc40d6b65': [169, 54],
  '0f53ca2313ab0d0940637172b0ec98c9d793bdba': [205, 61],
  '84068ad9c50e0093e7c206388e3987af968b8921': [224, 74],
};
const checks = verifiedRevisions[report.metadata.revision];
assert.ok(checks, 'Record actual local verification for this exact revision before importing its scan.');
assert.ok(report.metadata.analysisId && report.metadata.task);
const current = new Map(report.issues.map(issue => [issue.issue_id, issue]));
assert.equal(current.size, report.issues.length, 'Duplicate exported IDs');
const baselineIds = new Set(ledger.findings.map(finding => finding.id));
const dispositions = ledger.findings.map(finding => {
  const issue = current.get(finding.id);
  return { id: finding.id, status: issue?.status === 'CLOSED' ? 'verified_fixed' : 'pending', sonarStatus: issue?.status ?? 'NOT_EXPORTED' };
});
const added = report.issues.filter(issue => !baselineIds.has(issue.issue_id));
const checkpoint = {
  schemaVersion: 1,
  evidence: report.metadata,
  archiveFormat: 3,
  rationale: 'Only explicit CLOSED status in the matching completed analysis is counted as fixed. Missing findings and open findings remain pending. No safe review or false-positive acceptance is inferred.',
  regressionChecks: [`backend Jest: ${checks[0]} tests passed`, `frontend Vitest: ${checks[1]} tests passed`, 'backend TypeScript build passed', 'frontend TypeScript/Vite build passed'],
  baselineDispositions: dispositions,
  additionalFindings: added,
  releaseEligible: false,
};
const output = JSON.stringify(checkpoint, null, 2) + '\n';
if (process.argv[2] === '--write') {
  const outputPath = process.argv[3];
  assert.ok(outputPath?.startsWith('docs/sonarqube/checkpoint-'));
  fs.writeFileSync(outputPath, output);
} else {
  process.stdout.write(`*** Begin Patch\n*** Add File: D:/Coding/kubiq-product/kubiq/docs/sonarqube/checkpoint-${report.metadata.revision.slice(0, 7)}.json\n` + output.split('\n').filter((line, index, lines) => index < lines.length - 1).map(line => '+' + line).join('\n') + '\n*** End Patch\n');
}
