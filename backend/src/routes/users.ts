import { Router, Request, Response } from 'express';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { authMiddleware, getAuthenticationProvider, requirePermission, getUserFromReq } from '../middleware/auth';
import { AuditLogService } from '../services/AuditLogService';
import { RbacService } from '../services/RbacService';
import { RbacRoleService } from '../services/RbacRoleService';
import { KeycloakAdminService } from '../services/KeycloakAdminService';
import bcrypt from 'bcryptjs';

const router = Router();

const normalizeRoles = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(role => String(role).trim()).filter(Boolean))];
};

export const isLastActiveAdmin = (users: Array<{ id: string; enabled?: boolean; role?: string; roles?: string[] }>, id: string, nextRoles?: string[], nextEnabled?: boolean): boolean => {
  const target = users.find(user => user.id === id);
  if (!target || !RbacService.isAdmin(target)) return false;
  const targetRemainsAdmin = nextRoles ? nextRoles.includes('kubiq-admin') : true;
  const targetRemainsEnabled = nextEnabled ?? (target.enabled !== false);
  if (targetRemainsAdmin && targetRemainsEnabled) return false;
  return !users.some(user => user.id !== id && user.enabled !== false && RbacService.isAdmin(user));
};

// GET /api/users - List all users (Admin only)
router.get('/', authMiddleware, requirePermission('users.manage'), async (req: Request, res: Response) => {
  try {
    const repo = await DatabaseFactory.getUserRepository();
    if (getAuthenticationProvider() === 'keycloak') {
      const users = await new KeycloakAdminService().listUsers(String(req.query.search || '') || undefined);
      return res.json(users);
    }
    const users = await repo.getAllUsers();
    
    // Sanitize passwords
    const sanitized = users.map(u => ({
        ...u,
        passwordHash: undefined
    }));
    
    res.json(sanitized);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Native-mode user provisioning. Keycloak provisioning is handled by its dedicated Admin API service.
router.post('/', authMiddleware, requirePermission('users.manage'), async (req: Request, res: Response) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const roles = normalizeRoles(req.body?.roles);
    const allowedNamespaces = Array.isArray(req.body?.allowedNamespaces) ? req.body.allowedNamespaces.map((value: unknown) => String(value).trim().toLowerCase()).filter(Boolean) : undefined;
    if (!/^[a-zA-Z0-9._-]{3,100}$/.test(username) || password.length < 12 || roles.length === 0) return res.status(400).json({ message: 'Provide a valid username, a 12-character password, and at least one role.' });
    if (!(await RbacRoleService.validateRoleNames(roles))) return res.status(400).json({ message: 'One or more roles are unknown.' });
    if (getAuthenticationProvider() === 'keycloak') {
      const keycloak = new KeycloakAdminService();
      if (!keycloak.configured) return res.status(503).json({ message: 'Keycloak Admin API is not configured.' });
      const id = await keycloak.createUser({ username, email: req.body?.email, temporaryPassword: password, roles });
      AuditLogService.getInstance().log({ user: getUserFromReq(req), action: 'KEYCLOAK_USER_CREATE', target: `user/${username}`, details: `Created Keycloak user ${id} with kubiq client roles: ${roles.join(', ')}`, ip: req.ip });
      return res.status(201).json({ id, username, email: req.body?.email, roles, enabled: true, type: 'keycloak' });
    }
    if (getAuthenticationProvider() !== 'native') return res.status(409).json({ message: 'No user-provisioning authentication provider is configured.' });
    const repo = await DatabaseFactory.getUserRepository();
    if (await repo.findByUsername(username)) return res.status(409).json({ message: 'Username already exists.' });
    const created = await repo.createUser({ username, email: req.body?.email, passwordHash: await bcrypt.hash(password, 12), role: roles[0], roles, allowedNamespaces });
    AuditLogService.getInstance().log({ user: getUserFromReq(req), action: 'USER_CREATE', target: `user/${created.username}`, details: `Created Native user with roles: ${roles.join(', ')}`, ip: req.ip });
    res.status(201).json({ ...created, passwordHash: undefined });
  } catch (error: any) { res.status(500).json({ message: error.message }); }
});

const updateRoles = async (req: Request, res: Response, rawRoles: unknown) => {
  try {
    const { id } = req.params;
    const requestingUserId = (req.user as any)?.sub;
    const roles = normalizeRoles(rawRoles);

    if (requestingUserId === id) {
        return res.status(400).json({ message: 'Cannot change your own role assignments' });
    }

    if (roles.length === 0) {
        return res.status(400).json({ message: 'At least one role is required' });
    }
    if (!(await RbacRoleService.validateRoleNames(roles))) {
        return res.status(400).json({ message: 'One or more roles are unknown.' });
    }

    if (getAuthenticationProvider() === 'keycloak') {
      const keycloak = new KeycloakAdminService();
      const users = await keycloak.listUsers();
      if (isLastActiveAdmin(users, id as string, roles)) return res.status(409).json({ message: 'Cannot remove the final active kubiq-admin assignment.' });
      await keycloak.replaceUserClientRoles(id as string, roles);
      const target = users.find(user => user.id === id);
      AuditLogService.getInstance().log({ user: getUserFromReq(req), action: 'KEYCLOAK_CLIENT_ROLE_ASSIGNMENTS_UPDATE', target: `user/${target?.username || id}`, details: `Updated kubiq client roles to ${roles.join(', ')}`, ip: req.ip });
      return res.json({ ...target, roles });
    }

    const repo = await DatabaseFactory.getUserRepository();
    const users = await repo.getAllUsers();
    if (isLastActiveAdmin(users, id as string, roles)) {
      return res.status(409).json({ message: 'Cannot remove the final active kubiq-admin assignment.' });
    }
    const updated = await repo.updateUserRoles(id as string, roles);
    
    AuditLogService.getInstance().log({
        user: getUserFromReq(req),
        action: 'AUTH_ROLE_ASSIGNMENTS_UPDATE',
        target: `user/${updated.username}`,
        details: `Updated roles to ${roles.join(', ')}`,
        ip: req.ip
    });

    res.json({
        ...updated,
        passwordHash: undefined
    });

  } catch (error: any) {
      if (error.message === 'User not found' || error.message.includes('not found')) {
          res.status(404).json({ message: 'User not found' });
      } else {
        res.status(500).json({ message: error.message });
      }
  }
};

// Compatibility endpoint for older clients. New clients use /roles.
router.put('/:id/role', authMiddleware, requirePermission('users.manage'), async (req: Request, res: Response) => updateRoles(req, res, [req.body?.role]));
router.put('/:id/roles', authMiddleware, requirePermission('users.manage'), async (req: Request, res: Response) => updateRoles(req, res, req.body?.roles));

// DELETE /api/users/:id - Delete user (Admin only)
router.delete('/:id', authMiddleware, requirePermission('users.manage'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const requestingUserId = (req.user as any)?.sub;

        if (requestingUserId === id) {
            return res.status(400).json({ message: 'Cannot delete your own account' });
        }

        if (getAuthenticationProvider() === 'keycloak') {
            const keycloak = new KeycloakAdminService();
            const users = await keycloak.listUsers();
            const target = users.find(user => user.id === id);
            if (!target) return res.status(404).json({ message: 'User not found' });
            if (isLastActiveAdmin(users, id as string, [], false)) return res.status(409).json({ message: 'Cannot delete the final active kubiq-admin account.' });
            await keycloak.deleteUser(id as string);
            AuditLogService.getInstance().log({ user: getUserFromReq(req), action: 'KEYCLOAK_USER_DELETE', target: `user/${target.username}`, details: 'Deleted Keycloak user.', ip: req.ip });
            return res.json({ message: 'User deleted successfully' });
        }
        const repo = await DatabaseFactory.getUserRepository();
        const userToDeleteObj = await repo.findById(id as string);
        if (!userToDeleteObj) return res.status(404).json({ message: 'User not found' });
        const users = await repo.getAllUsers();
        if (isLastActiveAdmin(users, id as string, [], false)) {
            return res.status(409).json({ message: 'Cannot delete the final active kubiq-admin account.' });
        }
        await repo.deleteUser(id as string);

        AuditLogService.getInstance().log({
            user: getUserFromReq(req),
            action: 'USER_DELETE',
            target: `user/${userToDeleteObj?.username || id}`,
            details: `Deleted user account '${userToDeleteObj?.username || id}'`,
            ip: req.ip
        });

        res.json({ message: 'User deleted successfully' });
    } catch (error: any) {
        if (error.message.includes('not found')) {
            res.status(404).json({ message: 'User not found' });
        } else {
            res.status(500).json({ message: error.message });
        }
    }
});

// PUT /api/users/:id/status - Update user status (Admin only)
router.put('/:id/status', authMiddleware, requirePermission('users.manage'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { enabled } = req.body;
        const requestingUserId = (req.user as any)?.sub;

        if (requestingUserId === id && enabled === false) {
             return res.status(400).json({ message: 'Cannot disable your own account' });
        }
        
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ message: 'Invalid status' });
        }

        if (getAuthenticationProvider() === 'keycloak') {
            const keycloak = new KeycloakAdminService();
            const users = await keycloak.listUsers();
            const target = users.find(user => user.id === id);
            if (!target) return res.status(404).json({ message: 'User not found' });
            if (!enabled && isLastActiveAdmin(users, id as string, undefined, false)) return res.status(409).json({ message: 'Cannot disable the final active kubiq-admin account.' });
            await keycloak.updateUser(id as string, { enabled });
            AuditLogService.getInstance().log({ user: getUserFromReq(req), action: 'KEYCLOAK_USER_STATUS_UPDATE', target: `user/${target.username}`, details: `Updated Keycloak account status to ${enabled ? 'ENABLED' : 'DISABLED'}.`, ip: req.ip });
            return res.json({ ...target, enabled });
        }
        const repo = await DatabaseFactory.getUserRepository();
        const users = await repo.getAllUsers();
        if (!enabled && isLastActiveAdmin(users, id as string, undefined, false)) {
            return res.status(409).json({ message: 'Cannot disable the final active kubiq-admin account.' });
        }
        const updated = await repo.updateUserStatus(id as string, enabled);

        AuditLogService.getInstance().log({
            user: getUserFromReq(req),
            action: 'USER_STATUS_TOGGLE',
            target: `user/${updated.username}`,
            details: `Updated account status to ${enabled ? 'ENABLED' : 'DISABLED'}`,
            ip: req.ip
        });
        
        res.json({
            ...updated,
            passwordHash: undefined
        });
    } catch (error: any) {
        if (error.message.includes('not found')) {
            res.status(404).json({ message: 'User not found' });
        } else {
            res.status(500).json({ message: error.message });
        }
    }
});

// PUT /api/users/:id/namespaces - Update user allowed namespaces (Admin only)
router.put('/:id/namespaces', authMiddleware, requirePermission('users.manage'), async (req: Request, res: Response) => {
    try {
        if (getAuthenticationProvider() === 'keycloak') return res.status(409).json({ message: 'Namespace scopes are stored in kubiq Native identity records; Keycloak scope mapping is not configured.' });
        const { id } = req.params;
        const { allowedNamespaces } = req.body;
        
        if (!Array.isArray(allowedNamespaces)) {
            return res.status(400).json({ message: 'allowedNamespaces must be an array of strings' });
        }

        const repo = await DatabaseFactory.getUserRepository();
        const updated = await repo.updateUser(id as string, {
            allowedNamespaces: allowedNamespaces.map((ns: string) => String(ns).trim().toLowerCase()).filter(Boolean)
        });
        
        AuditLogService.getInstance().log({
            user: getUserFromReq(req),
            action: 'AUTH_ROLE_CHANGE',
            target: `user/${updated.username}`,
            details: `Updated allowed namespaces to: ${updated.allowedNamespaces?.join(', ') || '*'}`
        });

        res.json({
            ...updated,
            passwordHash: undefined
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});

// Administrator reset for Native users. The new password is never returned or logged.
router.put('/:id/password', authMiddleware, requirePermission('users.manage'), async (req: Request, res: Response) => {
  try {
    const password = String(req.body?.password || '');
    if (password.length < 12) return res.status(400).json({ message: 'Password must be at least 12 characters.' });
    if (getAuthenticationProvider() === 'keycloak') {
      const keycloak = new KeycloakAdminService();
      await keycloak.resetPassword(req.params.id as string, password);
      AuditLogService.getInstance().log({ user: getUserFromReq(req), action: 'KEYCLOAK_PASSWORD_RESET', target: `user/${req.params.id}`, details: 'Administrator set a temporary Keycloak password.', ip: req.ip });
      return res.json({ message: 'Temporary password set successfully.' });
    }
    if (getAuthenticationProvider() !== 'native') return res.status(409).json({ message: 'No password-reset authentication provider is configured.' });
    const repo = await DatabaseFactory.getUserRepository();
    const target = await repo.findById(req.params.id as string);
    if (!target) return res.status(404).json({ message: 'User not found' });
    await repo.updatePassword(target.id, await bcrypt.hash(password, 12));
    AuditLogService.getInstance().log({ user: getUserFromReq(req), action: 'AUTH_PASSWORD_RESET', target: `user/${target.username}`, details: 'Administrator reset a Native user password.', ip: req.ip });
    res.json({ message: 'Password reset successfully.' });
  } catch (error: any) { res.status(500).json({ message: error.message }); }
});

export { router as usersRouter };
