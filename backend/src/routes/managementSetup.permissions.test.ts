import express from 'express';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { RbacRoleService } from '../services/RbacRoleService';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { SystemMonitorService } from '../services/SystemMonitorService';
import { systemRouter } from './system';
import { rbacRouter } from './rbac';

describe('management setup least-privilege HTTP matrix', () => {
    const app = express();
    let server: ReturnType<typeof app.listen>;
    let origin: string;
    beforeAll(async () => {
        jest.spyOn(RbacRoleService, 'hasPermission').mockImplementation(async (user, permission) => (user.roles || []).includes(permission));
        jest.spyOn(RbacRoleService, 'getRoles').mockResolvedValue([{ id: 'viewer', name: 'kubiq-viewer', description: 'Viewer', permissions: ['logs.read'] }]);
        const monitor = SystemMonitorService.getInstance();
        jest.spyOn(monitor, 'getAllDisks').mockResolvedValue([]);
        jest.spyOn(monitor, 'getMonitoredDisksConfig').mockResolvedValue(['/data']);
        jest.spyOn(monitor, 'updateMonitoredDisks').mockResolvedValue(undefined);
        jest.spyOn(DatabaseFactory, 'getSystemRepository').mockResolvedValue({ getApmConfig: async () => ({ ignoredRoutes: ['/health'] }), updateApmConfig: async () => {} } as unknown as Awaited<ReturnType<typeof DatabaseFactory.getSystemRepository>>);
        app.use(express.json());
        app.use((req, _res, next) => {
            req.user = { id: 'fixture', username: 'fixture', roles: String(req.headers['x-fixture-permission'] || '').split(',') };
            next();
        });
        app.use('/system', systemRouter);
        app.use('/rbac', rbacRouter);
        server = app.listen(0);
        await new Promise<void>(resolve => server.once('listening', resolve));
        origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(async () => {
        jest.restoreAllMocks();
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    });
    const request = (path: string, permission: string, method = 'GET', body?: object) => fetch(`${origin}${path}`, {
        method, headers: { 'x-fixture-permission': permission, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });

    it('lets user managers read the assignment catalogue but not permission catalogue or role mutations', async () => {
        expect((await request('/rbac/roles', 'users.manage')).status).toBe(200);
        for (const [path, method] of [['/rbac/permissions', 'GET'], ['/rbac/roles', 'POST'], ['/rbac/roles/viewer', 'PUT'], ['/rbac/roles/viewer', 'DELETE'], ['/rbac/keycloak/sync', 'POST']]) {
            expect((await request(path, 'users.manage', method, method === 'POST' || method === 'PUT' ? {} : undefined)).status).toBe(403);
        }
    });
    it('allows system configuration setup reads and writes without broad system reads', async () => {
        for (const path of ['/system/disks', '/system/disks/config', '/system/apm-config']) expect((await request(path, 'system.configure')).status).toBe(200);
        expect((await request('/system/disks/config', 'system.configure', 'PUT', { mounts: ['/data'] })).status).toBe(200);
        expect((await request('/system/apm-config', 'system.configure', 'PUT', { ignoredRoutes: ['/health'] })).status).toBe(200);
        for (const path of ['/system/stats', '/system/prediction', '/system/pro-status', '/system/kubi-ai']) expect((await request(path, 'system.configure')).status).toBe(403);
    });
    it('does not let read-only users mutate configuration or unrelated managers read setup data', async () => {
        expect((await request('/system/disks/config', 'system.read')).status).toBe(200);
        expect((await request('/system/disks/config', 'system.read', 'PUT', { mounts: [] })).status).toBe(403);
        expect((await request('/system/apm-config', 'system.read', 'PUT', { ignoredRoutes: [] })).status).toBe(403);
        expect((await request('/system/apm-config', 'users.manage')).status).toBe(403);
        expect((await request('/rbac/roles', 'system.configure')).status).toBe(403);
    });
});
