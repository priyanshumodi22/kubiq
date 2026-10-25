const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const guideText = fs.readFileSync(path.join(root, 'docs/apm/instrumentation.json'), 'utf8').replaceAll('\r\n', '\n');
const guide = JSON.parse(guideText);
const hash = crypto.createHash('sha256').update(guideText).digest('hex');
const checking = process.argv.includes('--check');
const site = process.argv.includes('--site');
const fence = block => `### ${block.title}\n\n${block.filename ? 'File: `' + block.filename + '`\n\n' : ''}\`\`\`${block.language}\n${block.code}\n\`\`\`\n`;
const runtimeHeading = { node: '1. Node.js (Express, NestJS, Fastify)', python: '2. Python (Django, Flask, FastAPI)', java: '3. Java (Spring Boot)', nextjs: '4. Next.js 13+ (App Router)', go: '5. Go (net/http)' };
function runtimeMarkdown(runtime) {
  const collector = runtime.collector ? '\n### Required local Collector\n\n' + guide.collector.description + '\n\n' + guide.collector.blocks.map(fence).join('\n') : '';
  return `## ${runtimeHeading[runtime.id]}\n\n${runtime.description}\n\n${collector}\n${runtime.blocks.map(fence).join('\n')}`;
}
const intro = `<!-- Generated from docs/apm/instrumentation.json; edit the source, then regenerate. SHA256: ${hash} -->\n\n# ${guide.title}\n\n${guide.description}\n\n## Environment Variables Configuration\n\n${guide.endpointNotes}\n\n${guide.shellNotes}\n\nCollector examples are pinned to ${guide.collectorVersion}. Node/Python package versions are ${guide.nodeVersion}/${guide.pythonVersion}.\n\n`;
const verification = '\n## Verify real delivery\n\n' + guide.verification + '\n';
const agents = Object.fromEntries(['node', 'python'].map(id => [id, intro + guide.runtimes.filter(r => r.id === id || (id === 'node' && r.id === 'nextjs')).map(runtimeMarkdown).join('\n') + verification]));
const outputs = {
  'APM_INSTRUMENTATION_GUIDE.md': intro + [...guide.runtimes].sort((a,b) => runtimeHeading[a.id].localeCompare(runtimeHeading[b.id])).map(runtimeMarkdown).join('\n') + verification,
};
if (site) outputs['src/lib/apm-agent-guides.json'] = JSON.stringify(Object.fromEntries(Object.entries(agents).map(([id, text]) => [id, text.replace(/^# kubiq APM Integration Guide\s*/im, '')])), null, 2) + '\n';
else {
  outputs['frontend/src/utils/generated/apmGuide.json'] = JSON.stringify(guide, null, 2) + '\n';
  outputs['kubiq-apm/node/README.md'] = agents.node;
  outputs['kubiq-apm/python/README.md'] = agents.python;
}
for (const [file, content] of Object.entries(outputs)) {
  const target = path.join(root, file);
  if (checking) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8').replaceAll('\r\n', '\n') !== content) throw new Error('Stale generated APM guide: ' + file);
  } else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); }
}
console.log(`${checking ? 'Verified' : 'Generated'} APM guide ${guide.revision}, sha256 ${hash}`);
