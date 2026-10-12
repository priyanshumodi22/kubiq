import { Router, Request, Response } from 'express';
import { authMiddleware, getAuthenticationProvider, getUserFromReq, requirePermission } from '../middleware/auth';
import { AuditLogService } from '../services/AuditLogService';

import { AuthController } from '../controllers/AuthController';

const router = Router();

// GET /api/auth/config - Get Keycloak config for frontend
router.get('/config', (_req: Request, res: Response) => {
  const provider = getAuthenticationProvider();
  const config = {
    provider,
    enabled: provider === 'keycloak',
    nativeEnabled: provider === 'native',
    realm: process.env.KEYCLOAK_REALM || 'kubiq',
    url: process.env.KEYCLOAK_URL || 'http://localhost:8080/auth',
    clientId: process.env.KEYCLOAK_CLIENT_ID || 'kubiq-dashboard',
  };

  res.json(config);
});

// A migration is deployment-controlled because provider credentials and token verification
// cannot safely be changed in a browser session. This endpoint gives administrators a
// concrete preflight/rollback contract without exposing secrets.
router.post('/migration/preview', authMiddleware, requirePermission('auth.configure'), (req: Request, res: Response) => {
  const target = String(req.body?.target || '').toLowerCase();
  if (target !== 'native' && target !== 'keycloak') return res.status(400).json({ message: 'Target provider must be native or keycloak.' });
  const current = getAuthenticationProvider();
  const requirements = target === 'keycloak'
    ? ['Set AUTH_PROVIDER=keycloak', 'Set KEYCLOAK_ENABLED=true', 'Configure KEYCLOAK_URL, KEYCLOAK_REALM and KEYCLOAK_CLIENT_ID', 'Configure server-only KEYCLOAK_ADMIN_CLIENT_ID and KEYCLOAK_ADMIN_CLIENT_SECRET', 'Verify kubiq client roles and a Keycloak administrator before restart']
    : ['Set AUTH_PROVIDER=native', 'Set NATIVE_AUTH_ENABLED=true', 'Set a production JWT_SECRET', 'Export and retain the current Keycloak user/role mapping before restart', 'Verify at least two Native kubiq-admin accounts before cutover'];
  AuditLogService.getInstance().log({ user: getUserFromReq(req), action: 'AUTH_PROVIDER_MIGRATION_PREVIEW', target: `auth/${current || 'unconfigured'}-to-${target}`, details: 'Generated a deployment-controlled authentication migration preview.', ip: req.ip });
  res.json({ current, target, requiresRestart: current !== target, requirements, rollback: `Restore the prior deployment configuration with AUTH_PROVIDER=${current || 'native'} and restart after restoring the pre-cutover identity backup.` });
});

const requireNativeProvider = (_req: Request, res: Response, next: () => void) => {
  if (getAuthenticationProvider() !== 'native') return res.status(409).json({ message: 'Native authentication is not the selected provider for this deployment.' });
  next();
};

// Native Auth Routes
router.post('/login', requireNativeProvider, AuthController.login);
// Accounts are provisioned by an administrator from System Administration.
// Do not leave a public (or legacy alternate) registration path on an
// operations console: it would bypass the role, namespace and audit controls
// in /api/users.
router.post('/register', (_req: Request, res: Response) => res.status(410).json({ message: 'Self-registration is unavailable. Ask a kubiq administrator to create an account.' }));
router.post('/refresh', requireNativeProvider, AuthController.refresh);

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
