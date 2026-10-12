import { describe, expect, it } from '@jest/globals';
import { RbacService } from './RbacService';

describe('RbacService', () => {
  it('keeps a legacy single-role administrator fully authorized', () => {
    expect(RbacService.hasPermission({ role: 'kubiq-admin' }, 'system.configure')).toBe(true);
  });

  it('unions permissions from multiple assignments', () => {
    const roles = [
      { id: 'custom-logs', name: 'custom-logs', description: '', permissions: ['logs.export'] },
      { id: 'custom-audit', name: 'custom-audit', description: '', permissions: ['audit.read'] },
    ];
    expect(RbacService.hasPermission({ role: 'custom-logs', roles: ['custom-logs', 'custom-audit'] }, 'audit.read', roles)).toBe(true);
  });

  it('does not grant system administration to kubiq-user or kubiq-viewer', () => {
    expect(RbacService.hasPermission({ role: 'kubiq-user' }, 'system.configure')).toBe(false);
    expect(RbacService.hasPermission({ role: 'kubiq-viewer' }, 'system.configure')).toBe(false);
  });

  it('keeps read-only categories separate from sensitive, export, and administration capabilities', () => {
    const user = { role: 'kubiq-user', roles: ['kubiq-user'] };
    expect(RbacService.hasPermission(user, 'services.read')).toBe(true);
    expect(RbacService.hasPermission(user, 'logs.read')).toBe(true);
    expect(RbacService.hasPermission(user, 'apm.read')).toBe(true);
    expect(RbacService.hasPermission(user, 'kubernetes.read')).toBe(true);
    expect(RbacService.hasPermission(user, 'database.read')).toBe(true);
    expect(RbacService.hasPermission(user, 'logs.export')).toBe(false);
    expect(RbacService.hasPermission(user, 'audit.read')).toBe(false);
    expect(RbacService.hasPermission(user, 'kubernetes.secrets.read')).toBe(false);
    expect(RbacService.hasPermission(user, 'system.configure')).toBe(false);
  });

  it('grants kubi only to roles explicitly carrying kubi.use', () => {
    const customRoles: any = [{ id: 'incident-kubi', name: 'incident-kubi', description: '', permissions: ['kubi.use', 'services.read'] }];
    expect(RbacService.hasPermission({ role: 'kubiq-admin' }, 'kubi.use')).toBe(true);
    expect(RbacService.hasPermission({ role: 'kubiq-user' }, 'kubi.use')).toBe(true);
    expect(RbacService.hasPermission({ role: 'kubiq-viewer' }, 'kubi.use')).toBe(true);
    expect(RbacService.hasPermission({ role: 'incident-kubi' }, 'kubi.use', customRoles)).toBe(true);
    expect(RbacService.hasPermission({ role: 'incident-kubi' }, 'audit.read', customRoles)).toBe(false);
  });
});
