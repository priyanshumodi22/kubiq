const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { packageLinux } = require('./package-linux.cjs');

test('Linux package has isolated runtime, tracing and assets; never copies application env', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kubiq-package-'));
  try {
    const root = path.join(temp, 'source');
    const inputs = ['backend/build/index.js', 'backend/dist/telemetry/bootstrap.js', 'telemetry/node_modules/kubiq-apm/runtime.js', 'frontend/dist/index.html', 'LICENSE', 'release/linux.env.example', 'release/linux-check.cjs', 'release/linux-README.md', 'backend/.env'];
    for (const input of inputs) {
      fs.mkdirSync(path.dirname(path.join(root, input)), { recursive: true });
      fs.writeFileSync(path.join(root, input), input === 'backend/.env' ? 'PRIVATE_FIXTURE_SECRET' : input);
    }
    const node = Buffer.alloc(64); node.write('7f454c46', 'hex'); node.writeUInt16LE(62, 18);
    const nodeBinary = path.join(temp, 'node'); fs.writeFileSync(nodeBinary, node);
    const output = path.join(temp, 'bundle');
    assert.throws(() => packageLinux({ root, output, nodeBinary, arch: 'arm64' }), /architecture/);
    assert.equal(fs.existsSync(output), false);
    packageLinux({ root, output, nodeBinary, arch: 'x64', version: 'test', sha: 'fixture' });
    assert.equal(fs.existsSync(path.join(output, '.env')), false);
    assert.equal(fs.readFileSync(path.join(output, '.env.example'), 'utf8'), 'release/linux.env.example');
    assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'release.json'))).nodeMajor, 22);
    assert.match(fs.readFileSync(path.join(output, 'kubiq'), 'utf8'), /--require .\/telemetry\/bootstrap.js .\/index.js/);
    for (const input of ['runtime/node', 'public/index.html', 'node_modules/kubiq-apm/runtime.js', 'index.js']) assert(fs.existsSync(path.join(output, input)));
    assert.throws(() => packageLinux({ root, output, nodeBinary, arch: 'x64' }), /already exists/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
