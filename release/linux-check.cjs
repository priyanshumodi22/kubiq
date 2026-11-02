const fs = require('node:fs');
const manifest = require('./release.json');
if (process.platform !== 'linux' || process.arch !== manifest.arch) throw new Error('Incorrect bundled runtime architecture');
if (Number(process.versions.node.split('.')[0]) !== manifest.nodeMajor) throw new Error('Incorrect bundled Node runtime');
for (const file of ['index.js', 'telemetry/bootstrap.js', 'public/index.html', '.env.example', 'LICENSE']) {
  if (!fs.statSync(file).isFile()) throw new Error(`Missing ${file}`);
}
if (typeof require('kubiq-apm/runtime').startTracing !== 'function') throw new Error('Tracing runtime missing');
process.env.KUBIQ_TRACING_ENABLED = 'false';
require('./telemetry/bootstrap.js');
console.log(`kubiq ${manifest.version}: runtime, assets and tracing bootstrap verified (${manifest.arch})`);
