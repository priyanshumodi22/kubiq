import { Router, Request, Response } from 'express';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { authMiddleware, requireRole, getUserFromReq } from '../middleware/auth';
import { UserRole } from '../types';
import { AuditLogService } from '../services/AuditLogService';

const router = Router();

// GET /api/users - List all users (Admin only)
router.get('/', authMiddleware, requireRole('kubiq-admin'), async (req: Request, res: Response) => {
  try {
    const repo = await DatabaseFactory.getUserRepository();
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

// PUT /api/users/:id/role - Update user role (Admin only)
router.put('/:id/role', authMiddleware, requireRole('kubiq-admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const requestingUserId = (req.user as any)?.sub;

    if (requestingUserId === id) {
        return res.status(400).json({ message: 'Cannot change your own role' });
    }
    
    if (!role || (role !== 'kubiq-admin' && role !== 'kubiq-viewer')) {
        return res.status(400).json({ message: 'Invalid role' });
    }

    const repo = await DatabaseFactory.getUserRepository();
    const updated = await repo.updateUserRole(id as string, role as UserRole);
    
    AuditLogService.getInstance().log({
        user: getUserFromReq(req),
        action: 'AUTH_ROLE_CHANGE',
        target: `user/${updated.username}`,
        details: `Updated role to ${role}`,
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
});

// DELETE /api/users/:id - Delete user (Admin only)
router.delete('/:id', authMiddleware, requireRole('kubiq-admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const requestingUserId = (req.user as any)?.sub;

        if (requestingUserId === id) {
            return res.status(400).json({ message: 'Cannot delete your own account' });
        }

        const repo = await DatabaseFactory.getUserRepository();
        const userToDeleteObj = await repo.findById(id as string);
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
router.put('/:id/status', authMiddleware, requireRole('kubiq-admin'), async (req: Request, res: Response) => {
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

        const repo = await DatabaseFactory.getUserRepository();
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
router.put('/:id/namespaces', authMiddleware, requireRole('kubiq-admin'), async (req: Request, res: Response) => {
    try {
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

export { router as usersRouter };
