// Run only against a newly built local bundle: disposable JSON storage, no external DB.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:net');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(process.argv[2]);
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kubiq-release-smoke-'));
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  fs.writeFileSync(path.join(data, 'services.ini'), '');
  const child = spawn(path.join(root, 'kubiq'), [], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: {
    ...process.env, PORT: String(port), DB_TYPE: 'json', DATA_DIR: data,
    SERVICES_CONFIG_PATH: path.join(data, 'services.ini'), NATIVE_AUTH_ENABLED: 'true',
    JWT_SECRET: 'release-smoke-fixture-not-a-production-secret', KUBIQ_TRACING_ENABLED: 'false',
    FRONTEND_CONTEXT_PATH: '/kubiq', BACKEND_CONTEXT_PATH: '/kubiq-api',
  } });
  let output = ''; const capture = bytes => { output = (output + bytes.toString()).slice(-12000); };
  child.stdout.on('data', capture); child.stderr.on('data', capture);
  const exited = once(child, 'exit');
  try {
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (child.exitCode !== null) throw new Error(`Bundle exited before readiness: ${output}`);
      try { ready = (await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(1000) })).ok; } catch { /* startup */ }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert(ready, `Bundle did not become ready: ${output}`);
    const page = await fetch(`http://127.0.0.1:${port}/kubiq/`);
    assert(page.ok); assert.match(await page.text(), /<html/i);
    console.log('Linux bundle HTTP readiness and web assets passed with disposable JSON storage.');
  } finally {
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    await exited; clearTimeout(timer);
    // Newly created, absolute task-owned directory; never receives user or production data.
    if (path.dirname(data) !== path.resolve(os.tmpdir()) || !path.basename(data).startsWith('kubiq-release-smoke-')) throw new Error('Unsafe cleanup target');
    fs.rmSync(data, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
