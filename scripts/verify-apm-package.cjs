// Exercise the actual publish artifact, including its dependency graph, in CJS and ESM.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const sdk = path.join(root, 'kubiq-apm/node');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kubiq-apm-package-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function run(command, args, cwd = temp) {
    return execFileSync(command, args, { cwd, stdio: 'pipe', shell: process.platform === 'win32' && command === npm }).toString();
}
try {
    const packed = JSON.parse(run(npm, ['pack', '--json', '--pack-destination', temp], sdk))[0];
    if (packed.files.some(file => file.path.includes('.test.') || file.path.includes('coverage/'))) throw new Error('Test artifacts included in package');
    fs.writeFileSync(path.join(temp, 'package.json'), JSON.stringify({ private: true }));
    run(npm, ['install', '--prefer-offline', '--ignore-scripts', '--no-audit', '--no-fund', path.join(temp, packed.filename)]);
    const fixture = fs.readFileSync(path.join(sdk, 'runtime.test.cjs'), 'utf8')
        .replace("require('./runtime')", "require('kubiq-apm/runtime')")
        .replace("require('./runtime-state')", "require('kubiq-apm/runtime-state')");
    fs.writeFileSync(path.join(temp, 'runtime.test.cjs'), fixture);
    process.stdout.write(run(process.execPath, ['--test', 'runtime.test.cjs']));
    fs.writeFileSync(path.join(temp, 'esm.mjs'), "import { startTracing, traceRequest, traceDependency, withoutTracing } from 'kubiq-apm/runtime.js';\nimport assert from 'node:assert/strict';\nassert.equal(startTracing().enabled, false);\nfor (const helper of [traceRequest, traceDependency, withoutTracing]) assert.equal(typeof helper, 'function');\n");
    run(process.execPath, ['esm.mjs']);
    console.log('Packaged CJS and ESM runtime verified on ' + process.version);
} finally {
    // This absolute target is a newly created task-owned directory under the OS temp folder.
    if (path.dirname(temp) !== path.resolve(os.tmpdir()) || !path.basename(temp).startsWith('kubiq-apm-package-')) throw new Error('Unexpected cleanup path');
    fs.rmSync(temp, { recursive: true, force: true });
}
