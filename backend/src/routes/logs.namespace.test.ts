import express from 'express';
import type { AddressInfo } from 'node:net';
import { jest, expect, it, beforeAll, afterAll } from '@jest/globals';
import { logRouter } from './logs';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { RbacRoleService } from '../services/RbacRoleService';
jest.mock('@kubernetes/client-node', () => ({}));
jest.mock('../services/KubernetesService', () => ({ KubernetesService: { getInstance: () => ({}) } }));
jest.mock('../middleware/auth', () => ({ ...jest.requireActual<Record<string, unknown>>('../middleware/auth'), canAccessKubernetesNamespace: async (_user: unknown, namespace: string) => namespace === 'apps' }));
let server: ReturnType<express.Express['listen']>, origin: string;
beforeAll(async () => {
    jest.spyOn(RbacRoleService, 'hasPermission').mockImplementation(async (user, permission) => user.roles?.includes(permission) || false);
    jest.spyOn(DatabaseFactory, 'isLogStorageSupported').mockReturnValue(true);
    jest.spyOn(DatabaseFactory, 'getLogRepository').mockResolvedValue({ getServices: async () => ['vm', 'k8s:apps:web', 'k8s:private:secret'], queryLogs: async () => [], getLogSourcesForService: async () => [] } as unknown as Awaited<ReturnType<typeof DatabaseFactory.getLogRepository>>);
    const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { sub: 'fixture', roles: String(req.headers['x-permissions'] || 'logs.read,kubernetes.read,logs.raw.read').split(',') }; next(); }); app.use(logRouter);
    server = app.listen(0); await new Promise<void>(resolve => server.once('listening', resolve)); origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { jest.restoreAllMocks(); await new Promise<void>(resolve => server.close(() => resolve())); });
it('does not disclose cross-namespace service names through retained-log discovery', async () => {
    expect(await (await fetch(origin + '/all-services')).json()).toEqual(['vm', 'k8s:apps:web']);
    expect(await (await fetch(origin + '/all-services', { headers: { 'x-permissions': 'logs.read' } })).json()).toEqual(['vm']);
});
it('checks namespace scope for retained query, source and summary requests', async () => {
    for (const route of ['/query?fromMs=1&toMs=2&', '/sources?', '/recent-summary?']) {
        expect((await fetch(origin + route + 'serviceName=k8s:private:secret')).status).toBe(403);
        expect((await fetch(origin + route + 'serviceName=k8s:apps:web', { headers: { 'x-permissions': 'logs.read' } })).status).toBe(403);
    }
    expect((await fetch(origin + '/query?fromMs=1&toMs=2&serviceName=k8s:apps:web')).status).toBe(200);
    expect((await fetch(origin + '/summarize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serviceName: 'k8s:private:secret', logs: [{ message: 'fixture' }] }) })).status).toBe(403);
});

it('requires both logs and APM access for trace correlation', async () => {
    const route = origin + '/trace/1234567890abcdef1234567890abcdef';
    for (const permissions of ['logs.read', 'apm.read', 'kubernetes.read']) expect((await fetch(route, { headers: { 'x-permissions': permissions } })).status).toBe(403);
});
