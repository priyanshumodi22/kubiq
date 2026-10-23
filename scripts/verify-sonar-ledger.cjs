const assert = require('node:assert/strict');
const ledger = require('../docs/sonarqube/baseline-ledger.json');
assert.equal(ledger.findings.length, 841, 'Every baseline finding must remain accounted for.');
assert.equal(new Set(ledger.findings.map(finding => finding.id)).size, 841, 'Issue IDs must be unique.');
const statuses = new Set(['pending', 'modified_pending_scan', 'review_pending', 'verified_fixed', 'reviewed_safe', 'false_positive']);
const counts = {};
for (const finding of ledger.findings) {
  assert.ok(finding.file && finding.rule && statuses.has(finding.status), `Invalid finding ${finding.id}`);
  if (['verified_fixed', 'reviewed_safe', 'false_positive'].includes(finding.status)) {
    assert.ok(finding.verificationScan && finding.rationale && finding.tests.length, `Verified finding ${finding.id} needs scan evidence, rationale and tests.`);
  }
  counts[finding.status] = (counts[finding.status] || 0) + 1;
}
console.log(JSON.stringify({ total: ledger.findings.length, statuses: counts }));
const fs = require('node:fs');
const path = require('node:path');
const directory = path.join(__dirname, '../docs/sonarqube');
const checkpoints = fs.readdirSync(directory).filter(name => /^checkpoint-[a-f0-9]{7}\.json$/.test(name))
  .map(name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')));
const checkpoint = checkpoints.sort((a, b) => b.evidence.analysisDate - a.evidence.analysisDate)[0];
assert.ok(checkpoint, 'At least one actual analysis checkpoint is required.');
assert.equal(checkpoint.baselineDispositions.length, 841);
assert.equal(new Set(checkpoint.baselineDispositions.map(item => item.id)).size, 841);
const baselineIds = new Set(ledger.findings.map(item => item.id));
const checkpointCounts = {};
for (const item of checkpoint.baselineDispositions) {
  assert.ok(baselineIds.has(item.id));
  if (item.status === 'verified_fixed') {
    assert.equal(item.sonarStatus, 'CLOSED');
    assert.ok(checkpoint.evidence.analysisId && checkpoint.evidence.revision && checkpoint.regressionChecks.length && checkpoint.rationale);
  } else if (item.status === 'reviewed_safe') {
    assert.equal(item.sonarStatus, 'REVIEWED');
    assert.equal(item.verificationScan, checkpoint.evidence.analysisId);
    assert.ok(item.rationale && item.tests?.length, 'Safe reviews require individual rationale and verification.');
  } else if (item.status === 'false_positive') {
    assert.equal(item.sonarStatus, 'RESOLVED');
    assert.equal(item.reviewEvidence, 'False Positive');
    assert.equal(item.verificationScan, checkpoint.evidence.analysisId);
    assert.ok(item.rationale && item.tests?.length, 'Individual false positives need review and regression evidence.');
  } else assert.equal(item.status, 'pending');
  checkpointCounts[item.status] = (checkpointCounts[item.status] || 0) + 1;
}
assert.ok(checkpoint.additionalFindings.every(item => !baselineIds.has(item.issue_id)));
console.log(JSON.stringify({ checkpoint: checkpoint.evidence.revision, statuses: checkpointCounts, additionalFindings: checkpoint.additionalFindings.length, releaseEligible: checkpoint.releaseEligible }));
