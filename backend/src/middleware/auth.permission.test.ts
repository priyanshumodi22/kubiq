import { describe, expect, it, jest } from '@jest/globals';
import { canAccessKubernetesNamespace, checkNamespaceAccess, requirePermission } from './auth';
import { AuditLogService } from '../services/AuditLogService';
import { DatabaseFactory } from '../database/DatabaseFactory';
import type { IUserRepository } from '../database/interfaces/IUserRepository';

const response = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('requirePermission', () => {
  it('fails closed when a stored namespace policy cannot be loaded', async () => {
    const lookup = jest.spyOn(DatabaseFactory, 'getUserRepository').mockRejectedValue(new Error('offline'));
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const user = { sub: 'keycloak-fixture', type: 'keycloak' as const, roles: ['kubiq-viewer'] };
      const res = response();
      const next = jest.fn();
      await checkNamespaceAccess({ user, params: { ns: 'apps' } } as any, res, next);
      expect(res.status).toHaveBeenCalledWith(503);
      expect(next).not.toHaveBeenCalled();
      await expect(canAccessKubernetesNamespace(user, 'apps')).resolves.toBe(false);
    } finally { lookup.mockRestore(); warning.mockRestore(); }
  });
  it('applies stored Keycloak namespace scope consistently to HTTP and socket requests', async () => {
    const repository: Partial<IUserRepository> = { findById: async () => ({ id: 'keycloak-fixture', username: 'fixture', role: 'kubiq-viewer', allowedNamespaces: ['kube-system'] }) };
    const lookup = jest.spyOn(DatabaseFactory, 'getUserRepository').mockResolvedValue(repository as IUserRepository);
    try {
      const user = { sub: 'keycloak-fixture', type: 'keycloak' as const, roles: ['kubiq-viewer'] };
      const next = jest.fn();
      await checkNamespaceAccess({ user, params: { ns: 'kube-system' } } as any, response(), next);
      expect(next).toHaveBeenCalled();
      await expect(canAccessKubernetesNamespace(user, 'kube-system')).resolves.toBe(true);
      await expect(canAccessKubernetesNamespace(user, 'apps')).resolves.toBe(false);
    } finally { lookup.mockRestore(); }
  });
  it('does not turn an explicitly empty namespace scope into unrestricted access', async () => {
    const user = { roles: ['kubiq-viewer'], allowedNamespaces: [] };
    const res = response();
    const next = jest.fn();
    await checkNamespaceAccess({ user, params: { ns: 'kube-system' } } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    await expect(canAccessKubernetesNamespace(user, 'apps')).resolves.toBe(false);
  });
  it('allows a legacy kubiq-admin user through the permission guard', async () => {
    const next = jest.fn();
    await requirePermission('users.manage')({ user: { role: 'kubiq-admin', roles: ['kubiq-admin'] } } as any, response(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects a kubiq-viewer user without the required permission', async () => {
    const res = response();
    await requirePermission('system.configure')({ user: { role: 'kubiq-viewer', roles: ['kubiq-viewer'] } } as any, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'RBAC_FORBIDDEN' }));
  });

  it('allows a permitted namespace and rejects a namespace outside the explicit user scope', async () => {
    const allowedNext = jest.fn();
    await checkNamespaceAccess({ user: { roles: ['kubiq-viewer'], allowedNamespaces: ['apps'] }, params: { ns: 'apps' } } as any, response(), allowedNext);
    expect(allowedNext).toHaveBeenCalledTimes(1);

    const denied = response();
    await checkNamespaceAccess({ user: { roles: ['kubiq-viewer'], allowedNamespaces: ['apps'] }, params: { ns: 'kube-system' } } as any, denied, jest.fn());
    expect(denied.status).toHaveBeenCalledWith(403);
    expect(denied.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'RBAC_FORBIDDEN' }));
  });

  it('audits a kubi permission denial without exposing telemetry', async () => {
    const audit = AuditLogService.getInstance();
    const log = jest.spyOn(audit, 'log').mockImplementation(() => undefined as any);
    const res = response();
    await requirePermission('kubi.use')({ user: { username: 'viewer', roles: ['unknown-role'] }, ip: '127.0.0.1' } as any, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ action: 'KUBI_PERMISSION_DENIED', target: 'kubi/access' }));
    log.mockRestore();
  });
});
