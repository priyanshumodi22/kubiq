// Exercise LogStreamService with the actual installed glob/Path implementation, not a mock.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LogStreamService } = require('../../backend/dist/services/LogStreamService');
(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kubiq-glob-fixture-'));
  try {
    for (const [name, time] of [['older.log', 100000], ['latest.log', 200000], ['ignored.txt', 300000]]) {
      const file = path.join(temp, name); fs.writeFileSync(file, 'fixture'); fs.utimesSync(file, time, time);
    }
    const service = LogStreamService.getInstance();
    const pattern = path.join(temp, '*.log');
    const files = await service.scanFiles(pattern, 1);
    assert.deepEqual(files.map(file => file.name), ['latest.log']);
    assert.equal(files[0].path, path.join(temp, 'latest.log'));
    assert.deepEqual(await service.scanFiles(path.join(temp, 'missing-*.log'), 5), []);
    console.log('Actual glob log-source matching, Path.fullpath(), latest-file ordering and limit passed.');
  } finally {
    if (path.dirname(temp) !== path.resolve(os.tmpdir()) || !path.basename(temp).startsWith('kubiq-glob-fixture-')) throw new Error('Unexpected cleanup path');
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
