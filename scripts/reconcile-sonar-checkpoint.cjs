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
  'fd838d7360668cb401d4e3fcd8b9933aa1a2ae0c': [224, 74],
  'c711a841f67d2fcb8220867023821e0dbe00e044': [224, 74],
  '0cfa684fd99b4c13802f50a3cdfad983bbe2ab51': [224, 74],
  '9dc562e68462b3cf73e0fae12f648fa5dd0aa4cd': [224, 74],
  'adb8c68beab1d03cdc34d76415c9867c43bee519': [224, 75],
  '3e07db6ff08b113a339050ef2d0ee05e4e458184': [224, 77],
  '624585eec055166ba3537caf1f05ba8a7a02f5eb': [226, 77],
  '292f6e506cb74578bfb8ca490aa841cd5b8c71cb': [228, 77],
  'bff6049010b7d735d2a12a69fe5f48a9d0fa0dd5': [229, 77],
  '996fb430c1793ff0fa6705d2094e0f772e69faea': [229, 77],
  'fde0263c910853562c8a47e1ec580cb989aadd41': [241, 77],
  '9dc1c9c8821d001a62738ef2b7825c9db6bf37d2': [241, 77],
};
const checks = verifiedRevisions[report.metadata.revision];
assert.ok(checks, 'Record actual local verification for this exact revision before importing its scan.');
assert.ok(report.metadata.analysisId && report.metadata.task);
const current = new Map(report.issues.map(issue => [issue.issue_id, issue]));
assert.equal(current.size, report.issues.length, 'Duplicate exported IDs');
const baselineIds = new Set(ledger.findings.map(finding => finding.id));
// These are individual reviews recorded in SonarQube, not rule-wide exceptions.
const safeReviews = {
  '2d1881ee-92be-4c06-ac8d-30348b83cf5e': {
    file: 'backend/src/database/adapters/json/JsonServiceRepository.ts',
    rule: 'typescript:S4790',
    rationale: 'MD5 derives a deterministic non-secret service ID from the service name. It is not a password, signature, authentication token or integrity check. Retaining it preserves persisted service references.',
    tests: ['Repository compatibility and authorization regression tests passed; inspected the hash input and consumers.'],
  },
  'f9a2b2f3-4a10-4a3e-9e52-db8ff5f638fe': {
    file: 'backend/src/services/NotificationManager.ts',
    rule: 'typescript:S5332',
    rationale: 'The MessageCard @context is a schema identifier, not a network transport destination. The webhook URL is supplied separately. Retaining the identifier preserves Teams MessageCard compatibility.',
    tests: ['NotificationManager regression tests passed; inspected the MessageCard payload and outbound webhook target.'],
  },
};
const dispositions = ledger.findings.map(finding => {
  const issue = current.get(finding.id);
  const review = safeReviews[finding.id];
  if (issue?.status === 'REVIEWED' && review) {
    assert.equal(issue.file, review.file);
    assert.equal(issue.rule, review.rule);
    return { id: finding.id, status: 'reviewed_safe', sonarStatus: issue.status, rationale: review.rationale, tests: review.tests, verificationScan: report.metadata.analysisId };
  }
  return { id: finding.id, status: issue?.status === 'CLOSED' ? 'verified_fixed' : 'pending', sonarStatus: issue?.status ?? 'NOT_EXPORTED' };
});
const added = report.issues.filter(issue => !baselineIds.has(issue.issue_id));
const checkpoint = {
  schemaVersion: 1,
  evidence: report.metadata,
  archiveFormat: 3,
  rationale: 'Only explicit CLOSED status in the matching completed analysis is counted as fixed. Reviewed-safe status requires an individual recorded review with matching issue ID, file, rule and REVIEWED status. Missing and open findings remain pending.',
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
