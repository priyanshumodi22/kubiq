import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const config: any = {
  version: 1,
  updatedAt: 1,
  roles: [{ id: 'incident-reader', name: 'incident-reader', description: 'Read incidents', permissions: ['services.read'], builtIn: false }],
};
const getAllUsers = jest.fn<any>();
const saveRbacConfig = jest.fn<any>();

jest.mock('../database/DatabaseFactory', () => ({
  DatabaseFactory: {
    getSystemRepository: jest.fn(async () => ({ getRbacConfig: jest.fn(async () => config), saveRbacConfig })),
    getUserRepository: jest.fn(async () => ({ getAllUsers })),
  },
}));

import { permissionCatalogue, RbacRoleService } from './RbacRoleService';

describe('custom role lifecycle safety', () => {
  beforeEach(() => {
    saveRbacConfig.mockClear();
  });

  it('exposes every permission required by guarded system and terminal capabilities', () => {
    const keys = permissionCatalogue.map(([key]) => key);
    expect(keys).toContain('system.read');
    expect(keys).toContain('kubernetes.exec');
    expect(keys).toContain('logs.raw.read');
  });

  it('adds required base permissions when a custom role selects a layered capability', async () => {
    await RbacRoleService.createRole({
      name: 'trace-exporter',
      description: 'Exports trace data',
      permissions: ['apm.export', 'kubernetes.exec', 'system.configure'],
    });
    const saved: any = saveRbacConfig.mock.calls[saveRbacConfig.mock.calls.length - 1][0];
    const role = saved.roles.find((item: any) => item.name === 'trace-exporter');
    expect(role.permissions).toEqual(expect.arrayContaining([
      'apm.export', 'apm.read', 'kubernetes.exec', 'kubernetes.read',
      'system.configure', 'system.access',
    ]));
    expect(role.permissions).not.toContain('system.read');
  });

  it.each(['users.manage', 'roles.manage', 'system.configure'])('does not broaden %s into system telemetry read access', async permission => {
    const role = await RbacRoleService.createRole({ name: `fixture-${permission.replace('.', '-')}`, description: 'Narrow management fixture', permissions: [permission] });
    expect(new Set(role.permissions)).toEqual(new Set([permission, 'system.access']));
  });

  it('preserves the existing explicit kubi configuration read dependency', async () => {
    const role = await RbacRoleService.createRole({ name: 'fixture-kubi-configure', description: '', permissions: ['kubi.configure'] });
    expect(new Set(role.permissions)).toEqual(new Set(['kubi.configure', 'system.access', 'system.read']));
  });

  it('does not delete a custom role that remains assigned to a Native user', async () => {
    getAllUsers.mockResolvedValue([{ id: 'u-1', role: 'incident-reader', roles: ['incident-reader'] }]);
    await expect(RbacRoleService.deleteRole('incident-reader')).rejects.toThrow('RBAC_ROLE_ASSIGNED');
    expect(saveRbacConfig).not.toHaveBeenCalled();
  });

  it('allows deletion after assignments have been removed', async () => {
    getAllUsers.mockResolvedValue([{ id: 'u-1', role: 'kubiq-viewer', roles: ['kubiq-viewer'] }]);
    await RbacRoleService.deleteRole('incident-reader');
    expect(saveRbacConfig).toHaveBeenCalledWith(expect.objectContaining({ roles: [] }));
  });
});
