import { describe, expect, it, jest } from '@jest/globals';
import { RbacService } from '../services/RbacService';
import { checkNamespaceAccess } from '../middleware/auth';
import { maskServiceEndpoint } from '../utils/sensitiveData';

jest.mock('../database/DatabaseFactory', () => ({
  DatabaseFactory: { getSystemRepository: jest.fn(async () => ({ getRbacConfig: jest.fn(async () => null) })) },
}));

const response = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('RBAC acceptance matrix primitives', () => {
  it('combines explicitly assigned custom roles without granting unrelated administration', () => {
    const customRoles: any = [
      { id: 'incident-reader', name: 'incident-reader', description: '', permissions: ['logs.read', 'logs.export'] },
      { id: 'audit-reader', name: 'audit-reader', description: '', permissions: ['audit.read'] },
    ];
    const user = { role: 'incident-reader', roles: ['incident-reader', 'audit-reader'] };
    expect(RbacService.hasPermission(user, 'logs.export', customRoles)).toBe(true);
    expect(RbacService.hasPermission(user, 'audit.read', customRoles)).toBe(true);
    expect(RbacService.hasPermission(user, 'users.manage', customRoles)).toBe(false);
  });

  it('enforces an explicit Native namespace boundary before telemetry work', async () => {
    const next = jest.fn();
    await checkNamespaceAccess({ user: { roles: ['kubiq-viewer'], allowedNamespaces: ['team-a'] }, params: { ns: 'team-b' } } as any, response(), next);
    expect(next).not.toHaveBeenCalled();
  });

  it('masks database connection endpoints unless database.read is granted', async () => {
    const service = { name: 'orders-db', type: 'mongodb', endpoint: 'mongodb://user:secret@db.internal/orders' };
    const masked = await maskServiceEndpoint(service, { roles: ['kubiq-viewer'] });
    expect(masked.endpoint).toBe('*****');
    const readable = await maskServiceEndpoint(service, { roles: ['kubiq-user'] });
    expect(readable.endpoint).toBe(service.endpoint);
  });
});
