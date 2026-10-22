import { PermissionKey, RoleDefinition, User } from '../types';

const all = (...permissions: PermissionKey[]) => permissions;

/** The built-in RBAC catalogue. Custom role definitions extend this catalogue. */
export const builtinRoleDefinitions: RoleDefinition[] = [
  {
    id: 'kubiq-admin', name: 'kubiq-admin', description: 'Full kubiq system administration and observability access.', builtIn: true,
    permissions: ['*'],
  },
  {
    id: 'kubiq-user', name: 'kubiq-user', description: 'Read-only observability with safe checks.', builtIn: true,
    permissions: all(
      'system.read', 'services.read', 'logs.read', 'apm.read', 'kubernetes.read',
      'database.read', 'notifications.read', 'kubi.use'
    ),
  },
  {
    id: 'kubiq-viewer', name: 'kubiq-viewer', description: 'Restricted read-only kubiq telemetry access.', builtIn: true,
    permissions: all('services.read', 'logs.read', 'apm.read', 'kubernetes.read', 'kubi.use'),
  },
];

export class RbacService {
  static userRoles(user?: Pick<User, 'role' | 'roles'> | { role?: string; roles?: string[] } | null): string[] {
    const roles = user?.roles?.filter(Boolean) || [];
    if (roles.length > 0) return [...new Set(roles)];
    return user?.role ? [user.role] : [];
  }

  static effectivePermissions(user: Pick<User, 'role' | 'roles'> | { role?: string; roles?: string[] }, roleDefinitions = builtinRoleDefinitions): Set<PermissionKey> {
    const assigned = new Set(this.userRoles(user));
    const permissions = new Set<PermissionKey>();
    for (const role of roleDefinitions) {
      if (assigned.has(role.id) || assigned.has(role.name)) role.permissions.forEach(permission => permissions.add(permission));
    }
    return permissions;
  }

  static hasPermission(user: Pick<User, 'role' | 'roles'> | { role?: string; roles?: string[] }, permission: PermissionKey, roleDefinitions = builtinRoleDefinitions): boolean {
    const permissions = this.effectivePermissions(user, roleDefinitions);
    return permissions.has('*') || permissions.has(permission);
  }

  static isAdmin(user?: Pick<User, 'role' | 'roles'> | { role?: string; roles?: string[] } | null): boolean {
    return this.userRoles(user).includes('kubiq-admin');
  }
}
