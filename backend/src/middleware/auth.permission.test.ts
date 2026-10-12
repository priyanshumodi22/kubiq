import { describe, expect, it, jest } from '@jest/globals';
import { checkNamespaceAccess, requirePermission } from './auth';
import { AuditLogService } from '../services/AuditLogService';

const response = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('requirePermission', () => {
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
