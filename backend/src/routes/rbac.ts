import { Router } from 'express';
import { getAuthenticationProvider, getUserFromReq, requirePermission } from '../middleware/auth';
import { AuditLogService } from '../services/AuditLogService';
import { permissionCatalogue, RbacRoleService } from '../services/RbacRoleService';
import { KeycloakAdminService } from '../services/KeycloakAdminService';

const router = Router();
const audit = AuditLogService.getInstance();

router.get('/permissions', requirePermission('roles.manage'), (_req, res) => res.json(permissionCatalogue.map(([key, label]) => ({ key, label }))));
router.get('/roles', requirePermission('roles.manage'), async (_req, res, next) => {
  try { res.json(await RbacRoleService.getRoles()); } catch (error) { next(error); }
});

// This deliberately returns connection status only: service-account credentials never leave the server.
router.get('/keycloak/health', requirePermission('auth.configure'), async (_req, res, next) => {
  try {
    if (getAuthenticationProvider() !== 'keycloak') return res.json({ selected: false, configured: false, reachable: false });
    const health = await new KeycloakAdminService().health();
    res.json({ selected: true, ...health });
  } catch (error) { next(error); }
});

router.post('/roles', requirePermission('roles.manage'), async (req, res, next) => {
  try {
    const role = await RbacRoleService.createRole(req.body || {});
    if (getAuthenticationProvider() === 'keycloak') await new KeycloakAdminService().createClientRole(role.name, role.description);
    audit.log({ user: getUserFromReq(req), action: 'RBAC_ROLE_CREATE', target: `role/${role.name}`, details: `Created custom role ${role.name}.`, ip: req.ip });
    res.status(201).json(role);
  } catch (error) { next(error); }
});

router.put('/roles/:id', requirePermission('roles.manage'), async (req, res, next) => {
  try {
    const role = await RbacRoleService.updateRole(req.params.id as string, req.body || {});
    if (getAuthenticationProvider() === 'keycloak') await new KeycloakAdminService().updateClientRole(role.name, role.description);
    audit.log({ user: getUserFromReq(req), action: 'RBAC_ROLE_UPDATE', target: `role/${role.name}`, details: `Updated custom role ${role.name}.`, ip: req.ip });
    res.json(role);
  } catch (error) { next(error); }
});

router.delete('/roles/:id', requirePermission('roles.manage'), async (req, res, next) => {
  try {
    const role = (await RbacRoleService.getRoles()).find(candidate => candidate.id === req.params.id);
    await RbacRoleService.deleteRole(req.params.id as string);
    if (getAuthenticationProvider() === 'keycloak' && role && !role.builtIn) await new KeycloakAdminService().deleteClientRole(role.name);
    audit.log({ user: getUserFromReq(req), action: 'RBAC_ROLE_DELETE', target: `role/${req.params.id}`, details: 'Deleted custom role.', ip: req.ip });
    res.status(204).send();
  } catch (error: any) {
    if (error?.message === 'RBAC_ROLE_ASSIGNED') return res.status(409).json({ message: 'Reassign users before deleting this role.' });
    next(error);
  }
});

// Reconcile custom kubiq roles to the selected Keycloak client's roles.
// Realm roles are deliberately never inspected or changed.
router.post('/keycloak/sync', requirePermission('roles.manage'), async (req, res, next) => {
  try {
    if (getAuthenticationProvider() !== 'keycloak') return res.status(409).json({ message: 'Keycloak is not the selected authentication provider.' });
    const keycloak = new KeycloakAdminService();
    if (!keycloak.configured) return res.status(503).json({ message: 'Keycloak Admin API is not configured.' });
    const [roles, remoteRoles] = await Promise.all([RbacRoleService.getRoles(), keycloak.getClientRoles()]);
    const remote = new Set(remoteRoles.map(role => role.name));
    const expected = new Set(roles.filter(role => !role.builtIn).map(role => role.name));
    const created: string[] = [];
    for (const role of roles.filter(role => !role.builtIn)) {
      if (!remote.has(role.name)) { await keycloak.createClientRole(role.name, role.description); created.push(role.name); }
    }
    // Extra remote roles are reported as drift, never deleted automatically. This keeps retries safe
    // and avoids removing a role that may still be assigned while an administrator investigates.
    const unexpected = remoteRoles.map(role => role.name).filter(name => name.startsWith('kubiq-') && !expected.has(name));
    audit.log({ user: getUserFromReq(req), action: 'KEYCLOAK_CLIENT_ROLE_SYNC', target: 'keycloak/kubiq-client', details: `Reconciled ${created.length} missing custom kubiq client roles; ${unexpected.length} unexpected roles reported.`, ip: req.ip });
    res.json({ created, unexpected, inspected: roles.filter(role => !role.builtIn).length });
  } catch (error) { next(error); }
});

export const rbacRouter = router;
