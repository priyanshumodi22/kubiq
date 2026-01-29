import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';

import { AuthController } from '../controllers/AuthController';

const router = Router();

// GET /api/auth/config - Get Keycloak config for frontend
router.get('/config', (req: Request, res: Response) => {
  const config = {
    enabled: process.env.KEYCLOAK_ENABLED === 'true',
    nativeEnabled: process.env.NATIVE_AUTH_ENABLED !== 'false', // Default to true if not set
    realm: process.env.KEYCLOAK_REALM || 'kubiq',
    url: process.env.KEYCLOAK_URL || 'http://localhost:8080/auth',
    clientId: process.env.KEYCLOAK_CLIENT_ID || 'kubiq-dashboard',
  };

  res.json(config);
});

// Native Auth Routes
router.post('/login', AuthController.login);
router.post('/register', AuthController.register);

// GET /api/auth/me - Get current user info (Unified)
router.get('/me', authMiddleware, AuthController.me);

// PUT /api/auth/profile - Update user profile
router.put('/profile', authMiddleware, AuthController.updateProfile);

// PUT /api/auth/change-password - Change user password
router.put('/change-password', authMiddleware, AuthController.changePassword);

// GET /api/auth/user - Legacy endpoint (kept for backward compat or unified?)
// Redirecting to use same logic or keeping simple
router.get('/user', authMiddleware, (req: Request, res: Response) => {
  res.json({
    user: req.user || null,
    authenticated: !!req.user,
  });
});

// POST /api/auth/logout - Logout endpoint
router.post('/logout', (req: Request, res: Response) => {
    // Client side clears token.
    res.json({ success: true });
});

export { router as authRouter };
