import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// GET /api/auth/config - Get Keycloak config for frontend
router.get('/config', (req: Request, res: Response) => {
  const config = {
    enabled: process.env.KEYCLOAK_ENABLED === 'true',
    realm: process.env.KEYCLOAK_REALM || 'kubiq',
    url: process.env.KEYCLOAK_URL || 'http://localhost:8080/auth',
    clientId: process.env.KEYCLOAK_CLIENT_ID || 'kubiq-dashboard',
  };

  res.json(config);
});

// GET /api/auth/user - Get current user info
router.get('/user', authMiddleware, (req: Request, res: Response) => {
  res.json({
    user: req.user || null,
    authenticated: !!req.user,
  });
});

// GET /api/auth/me - Get current user info with roles
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  const user = req.user as any;

  if (!user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Not authenticated',
    });
  }

  res.json({
    username: user.preferred_username || user.sub,
    email: user.email,
    name: user.name,
    roles: user.roles || [],
    authenticated: true,
  });
});

// POST /api/auth/logout - Logout endpoint
router.post('/logout', (req: Request, res: Response) => {
  // In a stateless JWT setup, logout is handled client-side
  // Just return success
  res.json({ success: true });
});

export { router as authRouter };
