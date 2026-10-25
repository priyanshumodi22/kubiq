const {test} = require('node:test');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const guide = require('../../docs/apm/instrumentation.json');
test('registry fixture uses a dependency version and a pinned CLI package specifier', () => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kubiq-guide-manifest-'));
 try {
  const output = path.join(dir, 'next.json');
  execFileSync(process.execPath, [path.join(__dirname, 'manifest.cjs'), 'nextjs', 'registry', output]);
  const manifest = JSON.parse(fs.readFileSync(output, 'utf8'));
  const pkg = JSON.parse(manifest.items[0].data['next-package.json']);
  assert.equal(pkg.dependencies['kubiq-apm'], guide.nodeVersion);
  const init = manifest.items[1].spec.template.spec.initContainers;
  assert.ok(init.find(item => item.name === 'node-dependencies').command[2].endsWith('kubiq-apm@' + guide.nodeVersion));
 } finally {
  fs.unlinkSync(path.join(dir, 'next.json'));
  fs.rmdirSync(dir);
 }
});
