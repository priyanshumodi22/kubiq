import { jest, expect, it, beforeEach, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { kubernetesLogSourceRouter } from './kubernetesLogSources';
import { RbacRoleService } from '../services/RbacRoleService';
import { KubernetesLogSources, resolveLogPods } from '../services/KubernetesLogSources';
import { KubernetesService } from '../services/KubernetesService';
jest.mock('../services/KubernetesLogSources', () => ({ ...jest.requireActual<Record<string, unknown>>('../services/KubernetesLogSources'), KubernetesLogSources: { list: jest.fn(), change: jest.fn() }, resolveLogPods: jest.fn() }));
jest.mock('../middleware/auth', () => ({ ...jest.requireActual<Record<string, unknown>>('../middleware/auth'), canAccessKubernetesNamespace: async (_user: unknown, namespace: string) => namespace === 'apps' }));
jest.mock('../services/AuditLogService', () => ({ AuditLogService: { getInstance: () => ({ log: jest.fn() }) } }));
const input = { name: 'Web', namespace: 'apps', kind: 'deployment' as const, resource: 'web' };
const source = { ...input, id: 'saved', updatedAt: 1 };
let server: ReturnType<express.Express['listen']>, base: string;
beforeAll(async () => {
    jest.spyOn(RbacRoleService, 'hasPermission').mockImplementation(async (user, permission) => user.roles?.includes(permission) || false);
    const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { sub: 'fixture', roles: String(req.headers['x-permissions'] || '').split(',') }; next(); });
    app.use('/', kubernetesLogSourceRouter); app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { void _next; res.status(500).json({ message: 'Unavailable' }); });
    server = app.listen(0); await new Promise<void>(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { jest.restoreAllMocks(); await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
    jest.mocked(KubernetesLogSources.list).mockResolvedValue([source, { ...source, id: 'hidden', namespace: 'private' }]);
    jest.mocked(KubernetesLogSources.change).mockReset().mockResolvedValue(undefined);
    jest.mocked(resolveLogPods).mockReset().mockResolvedValue([]);
    jest.mocked(KubernetesService.getInstance).mockReturnValue(discovery as unknown as KubernetesService);
});
const request = (path = '/sources', method = 'GET', body?: object, permissions = 'kubernetes.read,services.manage,logs.raw.read') => fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-permissions': permissions }, body: body ? JSON.stringify(body) : undefined });
it('filters saved sources by namespace and requires Kubernetes access', async () => {
    expect(((await (await request()).json()) as Array<{id: string}>).map((item: { id: string }) => item.id)).toEqual(['saved']);
    expect((await request('/sources', 'GET', undefined, '')).status).toBe(403);
});
it('requires management plus raw access to create/update/delete sources', async () => {
    for (const permissions of ['kubernetes.read', 'kubernetes.read,services.manage', 'kubernetes.read,logs.raw.read']) expect((await request('/sources', 'POST', input, permissions)).status).toBe(403);
    expect((await request('/sources', 'POST', input)).status).toBe(200);
    expect((await request('/sources/saved', 'PUT', { ...input, container: 'web' })).status).toBe(200);
    expect((await request('/sources/saved', 'DELETE')).status).toBe(200);
    expect((await request('/sources/hidden', 'DELETE')).status).toBe(403);
    expect((await request('/sources/absent', 'DELETE')).status).toBe(404);
});
it('rejects forged destinations and inaccessible resources before persistence', async () => {
    expect((await request('/sources/hidden', 'PUT', input)).status).toBe(403);
    expect((await request('/sources/missing', 'PUT', input)).status).toBe(404);
    expect((await request('/sources', 'POST', {})).status).toBe(400);
    expect((await request('/sources', 'POST', { ...input, namespace: 'private' })).status).toBe(403);
    jest.mocked(resolveLogPods).mockResolvedValue([{ spec: { containers: [{ name: 'real' }] } }]);
    expect((await request('/sources', 'POST', { ...input, container: 'forged' })).status).toBe(400);
    jest.mocked(resolveLogPods).mockRejectedValue(new Error('missing resource'));
    expect((await request('/sources', 'POST', input)).status).toBe(400);
    expect(KubernetesLogSources.change).not.toHaveBeenCalled();
});
it('reports persistence failures without treating them as successful saves', async () => {
    jest.mocked(KubernetesLogSources.change).mockRejectedValue(new Error('offline'));
    expect((await request('/sources', 'POST', input)).status).toBe(500);
    expect((await request('/sources/saved', 'DELETE')).status).toBe(500);
    jest.mocked(KubernetesLogSources.list).mockRejectedValue(new Error('offline'));
    expect((await request()).status).toBe(500);
});

const api = { listNamespace: async () => ({ items: [{metadata: {name: 'apps'}}, {metadata: {name: 'private'}}] }), listNamespacedService: async () => ({ items: [{ metadata: { name: 'web' } }] }), listNamespacedDeployment: async () => ({ items: [{ metadata: { name: 'web' } }] }), listNamespacedStatefulSet: async () => ({ items: [] }), listNamespacedDaemonSet: async () => ({ items: [] }), listNamespacedPod: async () => ({ items: [] }) };
const discovery = { available: true, defaultContext: 'default', getNamespaces: async () => ['apps', 'private'], getKubeConfig: () => ({ clusters: [], users: [], contexts: [] }) };
jest.mock('../services/KubernetesService', () => ({ KubernetesService: { getInstance: jest.fn() } }));
it('discovers permitted namespaces, all target kinds and real container names', async () => {
    expect(await (await request('/namespaces')).json()).toEqual(['apps']);
    for (const kind of ['service', 'deployment', 'statefulset', 'daemonset', 'pod']) expect((await request('/targets?namespace=apps&kind=' + kind)).status).toBe(200);
    expect((await request('/targets?namespace=private&kind=pod')).status).toBe(403);
    expect((await request('/targets?namespace=apps&kind=secret')).status).toBe(400);
    expect((await request('/containers?namespace=apps&kind=pod&resource=web')).status).toBe(200);
    expect((await request('/containers?namespace=private&kind=pod&resource=web')).status).toBe(403);
    expect((await request('/containers')).status).toBe(400);
    jest.mocked(resolveLogPods).mockResolvedValue([{ spec: { containers: [{ name: 'web' }, { name: 'proxy' }] } }]);
    expect(await (await request('/containers?namespace=apps&kind=service&resource=web')).json()).toEqual(['proxy', 'web']);
    jest.mocked(KubernetesService.getInstance).mockReturnValue({ ...discovery, available: false } as unknown as KubernetesService);
    expect((await request('/namespaces')).status).toBe(503);
    expect((await request('/targets?namespace=apps&kind=pod')).status).toBe(503);
});
it('reports API discovery failure and never converts it into a healthy empty response', async () => {
    jest.mocked(KubernetesService.getInstance).mockReturnValue({ ...discovery, getNamespaces: async () => { throw new Error('offline'); }, getKubeConfig: () => { throw new Error('offline'); } } as unknown as KubernetesService);
    expect((await request('/namespaces')).status).toBe(500);
    expect((await request('/targets?namespace=apps&kind=pod')).status).toBe(500);
    jest.mocked(resolveLogPods).mockRejectedValue(new Error('offline'));
    expect((await request('/containers?namespace=apps&kind=pod&resource=web')).status).toBe(500);
});

jest.mock('@kubernetes/client-node', () => ({ CoreV1Api: class {}, AppsV1Api: class {}, KubeConfig: class { loadFromOptions() {} makeApiClient() { return api; } }, createConfiguration: () => ({middleware: []}) }));
