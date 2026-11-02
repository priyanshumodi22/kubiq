const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function assess(report, { root, sdkVersion, policy, now = new Date() }) {
  if (report.error || !report.vulnerabilities || !report.metadata?.vulnerabilities) throw new Error('A complete npm audit report is required');
  const rows = report.vulnerabilities;
  if (!Number.isInteger(report.metadata.vulnerabilities.total)
    || report.metadata.vulnerabilities.total !== Object.keys(rows).length) throw new Error('Audit finding counts are incomplete');
  const ids = new Set();
  const checked = new Set();
  function visit(name, active = new Set()) {
    if (checked.has(name)) return;
    const row = rows[name];
    if (!row || active.has(name) || !Array.isArray(row.via) || !row.via.length) throw new Error(`Unresolved advisory chain: ${name}`);
    if (['high', 'critical'].includes(row.severity)) throw new Error(`Unaccepted ${row.severity} finding: ${name}`);
    active.add(name);
    for (const via of row.via) {
      if (typeof via === 'string') { visit(via, active); continue; }
      const id = /^https:\/\/github\.com\/advisories\/(GHSA-[a-z0-9-]+)$/i.exec(via.url || '')?.[1];
      const assessment = policy.advisories[id];
      if (via.severity !== 'moderate' || !assessment?.packages.includes(name)
        || !policy.roots.includes(root) || sdkVersion !== policy.sdkVersion) throw new Error(`Unreviewed advisory: ${name} ${id || via.url}`);
      const deadline = new Date(`${policy.reviewBefore}T00:00:00Z`);
      if (!Number.isFinite(deadline.getTime()) || now >= deadline) throw new Error(`Dependency assessment expired: ${id}`);
      ids.add(id);
    }
    active.delete(name); checked.add(name);
  }
  for (const name of Object.keys(rows)) visit(name);
  if (report.metadata.vulnerabilities.total > 0 && !checked.size) throw new Error('Audit counts contain unresolved findings');
  return { root, graphFindings: Object.keys(rows).length, scopedAdvisories: [...ids].sort(), reviewBefore: ids.size ? policy.reviewBefore : null };
}

module.exports = { assess };
if (require.main === module) {
  try {
    const cwd = path.resolve(__dirname, '..');
    const policy = JSON.parse(fs.readFileSync(path.join(cwd, 'release/dependency-assessment.json')));
    const npmCli = [process.env.npm_execpath,
      path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
      path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')]
      .find(candidate => candidate && fs.existsSync(candidate));
    if (process.platform === 'win32' && !npmCli) throw new Error('Cannot locate npm CLI beside the Node runtime');
    for (const root of ['frontend', 'backend', 'telemetry']) {
      const args = ['audit', '--package-lock-only', '--omit=dev', '--json', '--prefix', root];
      const result = spawnSync(npmCli ? process.execPath : 'npm', npmCli ? [npmCli, ...args] : args,
        { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
      if (![0, 1].includes(result.status)) throw new Error(`npm audit unavailable for ${root}`);
      const lock = JSON.parse(fs.readFileSync(path.join(cwd, root, 'package-lock.json')));
      console.log(JSON.stringify(assess(JSON.parse(result.stdout), { root, sdkVersion: lock.packages['node_modules/kubiq-apm']?.version, policy })));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
