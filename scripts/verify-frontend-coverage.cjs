const assert = require('node:assert/strict');
const fs = require('node:fs');

function verifyFrontendCoverage(report, sourceFiles) {
  const expected = new Set(sourceFiles.filter(file => /\.(ts|tsx)$/.test(file)
    && !/(\.d\.ts$|\.(test|spec)\.(ts|tsx)$|__tests__)/.test(file))
    .map(file => `src/${file.replaceAll('\\', '/')}`));
  const actual = report.split('\n').filter(line => line.startsWith('SF:'))
    .map(line => line.slice(3).trim().replaceAll('\\', '/'));
  assert.ok(expected.size > 0, 'No frontend production sources found');
  assert.equal(new Set(actual).size, actual.length, 'Duplicate LCOV source records');
  for (const file of expected) assert.ok(actual.includes(file), `Missing production coverage record: ${file}`);
  for (const file of actual) assert.ok(expected.has(file), `Unexpected coverage record: ${file}`);
  return actual.length;
}

if (require.main === module) {
  const count = verifyFrontendCoverage(fs.readFileSync('frontend/coverage/lcov.info', 'utf8'),
    fs.readdirSync('frontend/src', { recursive: true }));
  console.log(`Verified coverage records for all ${count} frontend production TS/TSX files.`);
}
module.exports = { verifyFrontendCoverage };
