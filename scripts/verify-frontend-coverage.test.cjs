const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verifyFrontendCoverage } = require('./verify-frontend-coverage.cjs');
const files = ['App.tsx', 'utils/helper.ts', 'vite-env.d.ts', 'App.test.tsx'];
test('checks every production source with either path separator', () => {
  assert.equal(verifyFrontendCoverage('SF:src\\App.tsx\nSF:src/utils/helper.ts\n', files), 2);
});
test('missing coverage cannot silently pass', () => {
  assert.throws(() => verifyFrontendCoverage('SF:src/App.tsx\n', files), /Missing production/);
});
test('styles, declarations and tests cannot be counted as production coverage', () => {
  for (const extra of ['src/index.css', 'src/vite-env.d.ts', 'src/App.test.tsx']) {
    assert.throws(() => verifyFrontendCoverage(`SF:src/App.tsx\nSF:src/utils/helper.ts\nSF:${extra}\n`, files), /Unexpected coverage/);
  }
});
test('duplicate or empty reports cannot pass', () => {
  assert.throws(() => verifyFrontendCoverage('SF:src/App.tsx\nSF:src/App.tsx\n', files), /Duplicate/);
  assert.throws(() => verifyFrontendCoverage('', files), /Missing production/);
});
