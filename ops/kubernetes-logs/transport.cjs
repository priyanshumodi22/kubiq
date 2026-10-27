// Actual HTTP Kubernetes client + Socket.IO + native auth + saved-source APIs.
// All identities, APIs and files here are disposable fixtures; no live cluster is contacted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('node:http');
const { once } = require('node:events');
const root = path.resolve(__dirname, '../..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kubiq-log-transport-'));
Object.assign(process.env, { DATA_DIR: directory, DB_TYPE: 'json', NATIVE_AUTH_ENABLED: 'true', KEYCLOAK_ENABLED: 'false', AUTH_PROVIDER: 'native', JWT_SECRET: 'SYNTHETIC_LOG_TRANSPORT_JWT_SECRET', KUBIQ_TRACING_ENABLED: 'false' });
const express = require(path.join(root, 'backend/node_modules/express'));
const { Server } = require(path.join(root, 'backend/node_modules/socket.io'));
const { io: connect } = require(path.join(root, 'frontend/node_modules/socket.io-client'));
const jwt = require(path.join(root, 'backend/node_modules/jsonwebtoken'));
const { DatabaseFactory } = require(path.join(root, 'backend/dist/database/DatabaseFactory'));
const { KubernetesService } = require(path.join(root, 'backend/dist/services/KubernetesService'));
const { SavedKubernetesLogStreamService } = require(path.join(root, 'backend/dist/services/SavedKubernetesLogStreamService'));
const { IngestionBufferService } = require(path.join(root, 'backend/dist/services/IngestionBufferService'));
const { authMiddleware } = require(path.join(root, 'backend/dist/middleware/auth'));
const { logRouter } = require(path.join(root, 'backend/dist/routes/logs'));
let generation = 1;
const streams = new Set();
const clients = [];
const api = createServer((request, response) => {
  const url = new URL(request.url, 'http://fixture');
  if (url.pathname.includes('/private/')) { response.writeHead(403); response.end('{}'); return; }
  if (url.pathname.endsWith('/log')) {
    response.writeHead(200, { 'content-type': 'text/plain' }); response.flushHeaders();
    streams.add(response);
    const timer = setInterval(() => response.write(`${new Date().toISOString()} fixture-generation-${generation}\n`), 100);
    response.on('close', () => { clearInterval(timer); streams.delete(response); });
    return;
  }
  let body;
  if (url.pathname.endsWith('/services/web')) body = { apiVersion: 'v1', kind: 'Service', metadata: { name: 'web' }, spec: { selector: { app: 'web' } } };
  else if (url.pathname.endsWith('/pods')) {
    assert.equal(url.searchParams.get('labelSelector'), 'app=web');
    body = { apiVersion: 'v1', kind: 'PodList', items: [{ metadata: { name: 'web-' + generation, uid: 'uid-' + generation }, spec: { containers: [{ name: 'web' }, { name: 'proxy' }] }, status: { phase: 'Running' } }] };
  } else { response.writeHead(404); response.end('{}'); return; }
  response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(body));
});
const app = express(); app.use(express.json()); app.use('/api/logs', authMiddleware, logRouter);
const http = createServer(app), io = new Server(http);
new SavedKubernetesLogStreamService(io);
const waitFor = async (predicate, message) => {
  const deadline = Date.now() + 16000;
  while (Date.now() < deadline) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.fail(typeof message === 'function' ? message() : message);
};
async function client(token, origin, sourceId) {
  const socket = connect(origin, { transports: ['websocket'], auth: { token }, autoConnect: false });
  clients.push(socket);
  const data = { lines: [], errors: [], statuses: [] };
  socket.on('k8s:log:status', event => data.statuses.push(event));
  socket.on('k8s:log:line', event => data.lines.push(event.content));
  socket.on('k8s:log:error', event => data.errors.push(event.message));
  const connected = once(socket, 'connect'); socket.connect(); await connected;
  socket.emit('k8s:watch:source', { sourceId, namespace: 'forged' });
  return { socket, data };
}
(async () => {
  try {
    api.listen(0, '127.0.0.1'); await once(api, 'listening');
    const kubernetes = KubernetesService.getInstance();
    kubernetes.getKubeConfig().loadFromOptions({ clusters: [{ name: 'fixture', skipTLSVerify: true, server: 'http://127.0.0.1:' + api.address().port }], users: [{ name: 'fixture' }], contexts: [{ name: 'fixture', cluster: 'fixture', user: 'fixture' }], currentContext: 'fixture' });
    kubernetes.available = true; kubernetes.defaultContext = 'fixture';
    const users = await DatabaseFactory.getUserRepository();
    const admin = await users.createUser({ username: 'fixture-admin', role: 'kubiq-admin', roles: ['kubiq-admin'] });
    const reader = await users.createUser({ username: 'fixture-reader', role: 'kubiq-viewer', roles: ['kubiq-viewer'], allowedNamespaces: ['apps'] });
    const blocked = await users.createUser({ username: 'fixture-blocked', role: 'kubiq-viewer', roles: ['kubiq-viewer'], allowedNamespaces: ['other'] });
    const token = user => jwt.sign({ sub: user.id, type: 'native' }, process.env.JWT_SECRET, { expiresIn: '5m' });
    http.listen(0, '127.0.0.1'); await once(http, 'listening'); const origin = 'http://127.0.0.1:' + http.address().port;
    const headers = { Authorization: 'Bearer ' + token(admin), 'content-type': 'application/json' };
    await require(path.join(root, 'backend/dist/services/KubernetesLogSources')).resolveLogPods({ namespace: 'apps', kind: 'service', resource: 'web' });
    const saved = await fetch(origin + '/api/logs/kubernetes/sources', { method: 'POST', headers, body: JSON.stringify({ name: 'Web fixture', namespace: 'apps', kind: 'service', resource: 'web' }) });
    assert.equal(saved.status, 200); const source = await saved.json();
    assert.equal((await (await fetch(origin + '/api/logs/kubernetes/sources', { headers })).json())[0].id, source.id);
    const denied = await client(token(blocked), origin, source.id);
    await waitFor(() => denied.data.errors.length, 'Namespace denial was not emitted'); assert.equal(streams.size, 0);
    const first = await client(token(admin), origin, source.id), second = await client(token(reader), origin, source.id);
    await waitFor(() => first.data.lines.length >= 2 && second.data.lines.length >= 2, () => 'No real socket log data: ' + JSON.stringify({ first: first.data, second: second.data, streams: streams.size }));
    assert(first.data.lines.some(line => line.includes('[apps/web-1/web]')));
    assert(first.data.lines.some(line => line.includes('[apps/web-1/proxy]')));
    generation = 2;
    await waitFor(() => first.data.lines.some(line => line.includes('[apps/web-2/')) && second.data.lines.some(line => line.includes('[apps/web-2/')), 'Replacement pod was not followed');
    first.socket.emit('k8s:stop:logs'); first.socket.disconnect();
    await waitFor(() => streams.size === 2, 'One viewer stopping disrupted/leaked another viewer');
    const prior = second.data.lines.length;
    await waitFor(() => second.data.lines.length > prior, 'Remaining viewer stopped receiving logs');
    await users.updateUserStatus(reader.id, false);
    await waitFor(() => second.data.errors.length && streams.size === 0, 'Disabled user retained its active log stream');
    console.log(JSON.stringify({ passed: true, checks: ['saved HTTP configuration', 'native socket auth', 'namespace denial', 'all containers', 'real Kubernetes HTTP log client', 'pod replacement', 'independent subscribers', 'permission revocation', 'abort/cleanup'] }));
  } finally {
    for (const socket of clients) socket.disconnect();
    IngestionBufferService.getInstance().stop();
    await new Promise(resolve => io.close(resolve));
    api.closeAllConnections(); await new Promise(resolve => api.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
