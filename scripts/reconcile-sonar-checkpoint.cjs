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
  'c090516b1d0af8c06ac5620969beac8e6f94fba9': [241, 87],
  '591a3114c2fc7dc709f795d399921ac58d60b07a': [244, 87],
  '2322a6c044971db156972e9f868233244f303394': [244, 87],
  'b3032717f68cfd701aec58e34ca00b7d382b1241': [244, 97],
  'caf46484bad685e15b13443ff3bf45a2b43bcc6c': [244, 97],
  'fe0d435e69c11baa396b23b0997839df51f62292': [244, 110],
  '6f64ee82c86775ba86a2cd543ce7388293a2a20e': [244, 116],
  '7d04fb7c00a570067a137787a54681640c8889d6': [244, 122],
  '122a15865eecbf8e469c33cc86bb67bb1e7dee25': [244, 125],
  '2b8f31669d3700e43c38b028a7f43faee21247bd': [249, 125],
  '05b7d5f213410777088f173852085c4edd1e5188': [249, 130],
  'dd6d1c1a66a539a665e3bfce363d578b00ec5191': [250, 130],
  '2a820f5be0a277885b2a68aebf41bd1d5d5b4287': [250, 133],
  'cb09048c90116cc4ccff2a3630507ecc26ba28b7': [250, 144],
  'a24a19b86c9080a36ee2ddf07f76d31f510e99da': [250, 146],
  '007219052f266c9bf5c5b2d548733cde8f738182': [252, 150],
  '05aa0b267d7630e05a018ffd7cdf19e57a4ee4d0': [266, 159],
  'fec32eb61cf971bfb79c6e3c13d228183b5fd9f1': [266, 166],
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
