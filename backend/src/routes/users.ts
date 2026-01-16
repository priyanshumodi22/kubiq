import { Router, Request, Response } from 'express';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { authMiddleware, requireRole } from '../middleware/auth';
import { UserRole } from '../types';

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
        await repo.deleteUser(id as string);
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

export { router as usersRouter };
