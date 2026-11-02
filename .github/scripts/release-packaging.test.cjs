const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('../../backend/node_modules/js-yaml');
const root = path.resolve(__dirname, '../..');
const read = file => yaml.load(fs.readFileSync(path.join(root, file), 'utf8'));

test('manual verification does not publish an image or move main by default', () => {
  const workflow = read('.github/workflows/gcp-k3s.yml');
  assert.equal(workflow.on.workflow_dispatch.inputs.publish_image.default, false);
  assert.match(workflow.jobs['build-and-push'].if, /inputs\.publish_image/);
  assert(workflow.jobs.verify.steps.some(step => step.name === 'Reject high-severity production dependency advisories'));
});

test('both Linux architectures must pass runtime and HTTP smoke checks before asset upload', () => {
  const workflow = read('.github/workflows/deploy.yml');
  const job = workflow.jobs['build-binaries'];
  assert.deepEqual(job.strategy.matrix.include.map(row => row.arch).sort(), ['arm64', 'x64']);
  const build = job.steps.find(step => step.name === 'Build, package and smoke-test supported runtime');
  assert.match(build.run, /node:22-bookworm-slim/);
  assert.match(build.run, /scripts\/smoke-linux\.cjs/);
  assert.doesNotMatch(build.run, /node18|npx pkg|cp backend\/\.env/);
  const upload = job.steps.findIndex(step => step.uses?.startsWith('softprops/action-gh-release'));
  assert(upload > job.steps.indexOf(build));
  assert(job.steps.slice(job.steps.indexOf(build) + 1, upload).some(step => step.run?.includes('verify-sonar-release.cjs')));
});
