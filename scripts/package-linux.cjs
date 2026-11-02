const fs = require('node:fs');
const path = require('node:path');

function packageLinux({ root, output, nodeBinary, arch, version = 'local', sha = 'local' }) {
  if (!['x64', 'arm64'].includes(arch)) throw new Error('Unsupported Linux architecture');
  const binary = fs.readFileSync(nodeBinary);
  const machine = binary.length >= 20 ? binary.readUInt16LE(18) : 0;
  if (binary.subarray(0, 4).toString('hex') !== '7f454c46' || machine !== (arch === 'x64' ? 62 : 183)) {
    throw new Error('Node executable must match the Linux release architecture');
  }
  if (fs.existsSync(output)) throw new Error('Release output already exists; use a fresh directory');
  const files = [
    ['backend/build/index.js', 'index.js'],
    ['backend/dist/telemetry/bootstrap.js', 'telemetry/bootstrap.js'],
    ['telemetry/node_modules', 'node_modules'],
    ['frontend/dist', 'public'],
    ['LICENSE', 'LICENSE'],
    ['release/linux.env.example', '.env.example'],
    ['release/linux-check.cjs', 'check.cjs'],
    ['release/linux-README.md', 'README.md'],
  ];
  for (const [source] of files) if (!fs.existsSync(path.join(root, source))) throw new Error(`Missing release input: ${source}`);
  fs.mkdirSync(path.join(output, 'runtime'), { recursive: true });
  for (const [source, target] of files) fs.cpSync(path.join(root, source), path.join(output, target), { recursive: true });
  fs.copyFileSync(nodeBinary, path.join(output, 'runtime/node'));
  fs.chmodSync(path.join(output, 'runtime/node'), 0o755);
  fs.writeFileSync(path.join(output, 'release.json'), JSON.stringify({ version, sha, arch, nodeMajor: 22 }, null, 2));
  fs.writeFileSync(path.join(output, 'kubiq'), '#!/bin/sh\nset -eu\ncd -- "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\ncase "${1:-}" in\n  --version) exec ./runtime/node -p "require(\'./release.json\').version" ;;\n  --check) exec ./runtime/node ./check.cjs ;;\nesac\nexec ./runtime/node --env-file-if-exists=.env --require ./telemetry/bootstrap.js ./index.js "$@"\n');
  fs.chmodSync(path.join(output, 'kubiq'), 0o755);
}

module.exports = { packageLinux };
if (require.main === module) {
  const [arch, output, nodeBinary] = process.argv.slice(2);
  packageLinux({ root: path.resolve(__dirname, '..'), output: path.resolve(output), nodeBinary,
    arch, version: process.env.RELEASE_VERSION, sha: process.env.RELEASE_SHA });
}
