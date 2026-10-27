// Configuration round trip against the same disposable base database as the adapter fixture.
const assert = require('node:assert/strict');
const path = require('node:path');
module.exports = async function verifyLogConfig(kind) {
  if (kind === 'clickhouse') return; // ClickHouse overrides telemetry; it is not a base configuration adapter.
  const name = kind === 'mongo' ? 'MongoSystemRepository' : 'MysqlSystemRepository';
  const { [name]: Repository } = require(path.join(process.env.COMPILED_BACKEND, 'database/adapters', kind === 'mongo' ? 'mongo' : 'mysql', name));
  const instances = [new Repository(), new Repository()];
  try {
    await instances[0].updateApmConfig({ ignoredRoutes: ['/fixture'] });
    const config = { version: 1, updatedAt: 1, sources: [{ id: 'fixture-source', name: 'Web logs', namespace: 'apps', kind: 'service', resource: 'web', container: 'web', updatedAt: 1 }] };
    await instances[0].saveKubernetesLogConfig(config);
    assert.deepEqual(await instances[1].getKubernetesLogConfig(), config);
    assert.deepEqual(await instances[1].getApmConfig(), { ignoredRoutes: ['/fixture'] });
    console.log(JSON.stringify({ passed: true, adapter: kind, check: 'saved Kubernetes source survives repository recreation; unrelated configuration preserved' }));
  } finally {
    if (kind !== 'mongo') for (const instance of instances) await instance.pool?.end();
  }
};
