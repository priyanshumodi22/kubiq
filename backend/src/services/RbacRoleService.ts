import { randomUUID } from 'node:crypto';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { RoleDefinition } from '../types';
import { builtinRoleDefinitions, RbacService } from './RbacService';

export const permissionCatalogue = [
  ['system.access', 'Open System Administration'], ['system.read', 'View system health and configuration'], ['system.configure', 'Configure system defaults'], ['auth.configure', 'Configure authentication'],
  ['users.manage', 'Manage users and assignments'], ['roles.manage', 'Manage custom roles and permissions'],
  ['services.read', 'View monitored services'], ['services.manage', 'Manage monitored services'],
  ['logs.read', 'Search logs'], ['logs.export', 'Export logs'], ['logs.raw.read', 'View raw log sources and paths'],
  ['apm.read', 'View APM traces'], ['apm.export', 'Export APM traces'], ['database.read', 'View database observability'], ['database.sql.read', 'View raw SQL'],
  ['kubernetes.read', 'View Kubernetes telemetry'], ['kubernetes.namespaces.all', 'Read every Kubernetes namespace'], ['kubernetes.secrets.read', 'View Kubernetes Secret metadata or YAML'], ['kubernetes.exec', 'Open Kubernetes pod terminals'], ['notifications.read', 'View notifications'], ['notifications.manage', 'Manage notifications'],
  ['audit.read', 'View audit history'], ['audit.export', 'Export audit history'],
  ['kubi.use', 'Use kubi'], ['kubi.configure', 'Configure kubi provider and limits'],
] as const;

// Some capabilities are layered on top of a base read capability. Persist the
// dependency with the role so selecting a meaningful action in the role builder
// never creates a role whose own API request is denied by an enclosing guard.
const permissionDependencies: Record<string, string[]> = {
  'system.access': ['system.read'],
  'services.manage': ['services.read'],
  'notifications.manage': ['notifications.read'],
  'database.read': ['services.read'],
  'roles.manage': ['system.access'],
  'auth.configure': ['system.access'],
  'system.configure': ['system.access'],
  'kubi.configure': ['system.access'],
  'logs.export': ['logs.read'],
  'logs.raw.read': ['logs.read'],
  'apm.export': ['apm.read'],
  'audit.export': ['audit.read'],
  'database.sql.read': ['database.read'],
  'kubernetes.namespaces.all': ['kubernetes.read'],
  'kubernetes.secrets.read': ['kubernetes.read'],
  'kubernetes.exec': ['kubernetes.read'],
};

const normalizedPermissions = (permissions: unknown): string[] => {
  const normalized = new Set(Array.isArray(permissions) ? permissions.map(value => String(value).trim()).filter(Boolean) : []);
  const pending = [...normalized];
  while (pending.length) {
    const permission = pending.pop()!;
    for (const dependency of permissionDependencies[permission] || []) {
      if (!normalized.has(dependency)) {
        normalized.add(dependency);
        pending.push(dependency);
      }
    }
  }
  return [...normalized];
};

export class RbacRoleService {
  static async getRoles(): Promise<RoleDefinition[]> {
    const config = await (await DatabaseFactory.getSystemRepository()).getRbacConfig();
    const custom = (config?.roles || []).filter(role => !role.builtIn && !builtinRoleDefinitions.some(builtIn => builtIn.id === role.id));
    return [...builtinRoleDefinitions, ...custom];
  }

  static async createRole(input: Pick<RoleDefinition, 'name' | 'description' | 'permissions'>): Promise<RoleDefinition> {
    const name = String(input.name || '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9-_]{2,63}$/.test(name) || builtinRoleDefinitions.some(role => role.name === name)) {
      throw new Error('RBAC_ROLE_NAME_INVALID');
    }
    const permissions = normalizedPermissions(input.permissions);
    const known = new Set<string>(permissionCatalogue.map(([key]) => key));
    if (permissions.length === 0 || permissions.some(permission => !known.has(permission))) throw new Error('RBAC_PERMISSION_INVALID');
    const roles = await this.getRoles();
    if (roles.some(role => role.name === name)) throw new Error('RBAC_ROLE_EXISTS');
    const role: RoleDefinition = { id: `role-${randomUUID()}`, name, description: String(input.description || '').trim().slice(0, 280), permissions, builtIn: false };
    await this.saveCustomRoles([...roles.filter(existing => !existing.builtIn), role]);
    return role;
  }

  static async updateRole(id: string, input: Pick<RoleDefinition, 'description' | 'permissions'>): Promise<RoleDefinition> {
    const roles = await this.getRoles();
    const role = roles.find(candidate => candidate.id === id);
    if (!role) throw new Error('RBAC_ROLE_NOT_FOUND');
    if (role.builtIn) throw new Error('RBAC_BUILTIN_ROLE_IMMUTABLE');
    const permissions = normalizedPermissions(input.permissions);
    const known = new Set<string>(permissionCatalogue.map(([key]) => key));
    if (permissions.length === 0 || permissions.some(permission => !known.has(permission))) throw new Error('RBAC_PERMISSION_INVALID');
    const updated = { ...role, description: String(input.description || '').trim().slice(0, 280), permissions };
    await this.saveCustomRoles(roles.filter(candidate => !candidate.builtIn).map(candidate => candidate.id === id ? updated : candidate));
    return updated;
  }

  static async deleteRole(id: string): Promise<void> {
    const roles = await this.getRoles();
    const role = roles.find(candidate => candidate.id === id);
    if (!role) throw new Error('RBAC_ROLE_NOT_FOUND');
    if (role.builtIn) throw new Error('RBAC_BUILTIN_ROLE_IMMUTABLE');
    // Do not silently turn assigned users into unknown-role users. An
    // administrator must reassign the affected Native identities first; this
    // preserves a clear, auditable access transition.
    const users = await (await DatabaseFactory.getUserRepository()).getAllUsers();
    if (users.some(user => RbacService.userRoles(user).includes(role.name) || RbacService.userRoles(user).includes(role.id))) {
      throw new Error('RBAC_ROLE_ASSIGNED');
    }
    await this.saveCustomRoles(roles.filter(candidate => !candidate.builtIn && candidate.id !== id));
  }

  static async validateRoleNames(roleNames: string[]): Promise<boolean> {
    const names = new Set((await this.getRoles()).flatMap(role => [role.id, role.name]));
    return roleNames.every(role => names.has(role));
  }

  static async hasPermission(user: { role?: string; roles?: string[] }, permission: string): Promise<boolean> {
    const roleNames = RbacService.userRoles(user);
    const usesOnlyBuiltIns = roleNames.every(roleName => builtinRoleDefinitions.some(role => role.id === roleName || role.name === roleName));
    if (usesOnlyBuiltIns) return RbacService.hasPermission(user, permission);
    return RbacService.hasPermission(user, permission, await this.getRoles());
  }

  static async getEffectivePermissions(user: { role?: string; roles?: string[] }): Promise<string[]> {
    return [...RbacService.effectivePermissions(user, await this.getRoles())];
  }

  private static async saveCustomRoles(roles: RoleDefinition[]): Promise<void> {
    await (await DatabaseFactory.getSystemRepository()).saveRbacConfig({ version: 1, roles, updatedAt: Date.now() });
  }
}
