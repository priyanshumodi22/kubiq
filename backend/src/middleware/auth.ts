import { Request, Response, NextFunction } from 'express';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { RbacService } from '../services/RbacService';
import { RbacRoleService } from '../services/RbacRoleService';
import axios from 'axios';
import { createPublicKey } from 'node:crypto';
import { AuditLogService } from '../services/AuditLogService';
import { getNativeJwtSecret, isNativeJwtConfigurationError } from '../utils/nativeJwt';

interface KeycloakConfig {
  realm: string;
  authServerUrl: string;
  clientId: string;
  enabled: boolean;
}

const keycloakConfig: KeycloakConfig = {
  realm: process.env.KEYCLOAK_REALM || 'kubiq',
  authServerUrl: process.env.KEYCLOAK_URL || 'http://localhost:8080/auth',
  clientId: process.env.KEYCLOAK_CLIENT_ID || 'kubiq-dashboard',
  enabled: process.env.KEYCLOAK_ENABLED === 'true',
};

export type AuthenticationProvider = 'native' | 'keycloak';
const nativeAuthEnabled = process.env.NATIVE_AUTH_ENABLED !== 'false';
const requestedAuthProvider = process.env.AUTH_PROVIDER?.trim().toLowerCase();
const authProvider: AuthenticationProvider | null = requestedAuthProvider === 'native' || requestedAuthProvider === 'keycloak'
  ? requestedAuthProvider
  : keycloakConfig.enabled ? 'keycloak' : nativeAuthEnabled ? 'native' : null;

export const getAuthenticationProvider = (): AuthenticationProvider | null => authProvider;

// Cache for validated tokens (in production, use Redis or similar)
const tokenCache = new Map<string, { exp: number; user: any }>();
const jwksCache = new Map<string, { expiresAt: number; keys: any[] }>();

import jwt from 'jsonwebtoken';

const keycloakIssuer = () => `${keycloakConfig.authServerUrl.replace(/\/$/, '')}/realms/${encodeURIComponent(keycloakConfig.realm)}`;

export const verifyKeycloakToken = async (token: string): Promise<any> => {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === 'string' || !decoded.header.kid || decoded.header.alg !== 'RS256') throw new Error('Invalid Keycloak token header');
  const issuer = keycloakIssuer();
  const cached = jwksCache.get(issuer);
  const keys = cached && cached.expiresAt > Date.now()
    ? cached.keys
    : (await axios.get(`${issuer}/protocol/openid-connect/certs`, { timeout: 5000, maxRedirects: 0 })).data.keys;
  if (!cached || cached.expiresAt <= Date.now()) jwksCache.set(issuer, { keys, expiresAt: Date.now() + 10 * 60_000 });
  const jwk = keys.find((key: any) => key.kid === decoded.header.kid && key.kty === 'RSA');
  if (!jwk) throw new Error('Keycloak signing key not found');
  const key = createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
  return jwt.verify(token, key, { algorithms: ['RS256'], issuer, audience: keycloakConfig.clientId });
};

/** Authenticate a Socket.IO handshake with the same provider and claims used by HTTP routes. */
export const getSocketUser = async (token: unknown): Promise<any | null> => {
  if (typeof token !== 'string' || !token || !authProvider) return null;
  try {
    if (authProvider === 'native') {
      const decoded = jwt.verify(token, getNativeJwtSecret()) as any;
      if (decoded?.type !== 'native') return null;
      const username = decoded.username || decoded.preferred_username || decoded.sub || 'admin';
      return { ...decoded, username, preferred_username: username };
    }
    const payload = await verifyKeycloakToken(token) as any;
    const roles = payload.resource_access?.[keycloakConfig.clientId]?.roles || [];
    const username = payload.preferred_username || payload.username || payload.name || payload.sub || 'admin';
    return { ...payload, username, preferred_username: username, roles: [...new Set(roles)], type: 'keycloak' };
  } catch {
    return null;
  }
};

/** Namespace scope for websocket requests mirrors checkNamespaceAccess for HTTP routes. */
export const canAccessKubernetesNamespace = async (user: any, namespace: unknown): Promise<boolean> => {
  const requested = typeof namespace === 'string' ? namespace.trim().toLowerCase() : '';
  if (!requested || requested === 'all' || requested === '*') return false;
  if (await RbacRoleService.hasPermission(user || {}, 'kubernetes.namespaces.all')) return true;
  const allowed = Array.isArray(user?.allowedNamespaces) && user.allowedNamespaces.length > 0
    ? user.allowedNamespaces
    : ['apps', 'default'];
  return allowed.some((value: unknown) => String(value).trim().toLowerCase() === requested);
};

// ... config ...

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // Check Authorization header first, then query parameter
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token as string;

  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (queryToken) {
    token = queryToken;
  }

  if (!token) {
    // If no auth provider is configured, reject with a configuration error — never bypass
    if (!authProvider) {
        return res.status(503).json({
          error: 'Auth Not Configured',
          message: 'No authentication provider is enabled. Set NATIVE_AUTH_ENABLED=true or KEYCLOAK_ENABLED=true and restart.',
        });
    }
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No valid authorization token provided',
    });
  }

  // A deployment accepts tokens from exactly one selected provider.
  if (authProvider === 'native') {
    try {
      const secret = getNativeJwtSecret();
      if (secret) {
          const decoded = jwt.verify(token, secret) as any;
          if (decoded && decoded.type === 'native') {
              const username = decoded.username || decoded.preferred_username || decoded.sub || 'admin';
              req.user = {
                  ...decoded,
                  username,
                  preferred_username: username
              };
              return next();
          }
      }
    } catch (err) {
      if (isNativeJwtConfigurationError(err)) {
        return res.status(503).json({ error: 'NATIVE_JWT_SECRET_UNAVAILABLE', message: err.message });
      }
      return res.status(401).json({ message: 'Invalid or expired Native authentication token' });
    }
    return res.status(401).json({ message: 'Invalid Native authentication token' });
  }

  // Keycloak is the selected provider from this point onward.
  if (authProvider !== 'keycloak' || !keycloakConfig.enabled) {
      return res.status(503).json({ error: 'AUTH_PROVIDER_UNAVAILABLE', message: 'The selected authentication provider is not configured.' });
  }

  try {
    // Check cache first
    const cached = tokenCache.get(token);
    if (cached && cached.exp > Date.now() / 1000) {
      req.user = cached.user;
      return next();
    }

    // Verify the Keycloak signature, issuer, audience and expiry against its JWKS.
      const payload = await verifyKeycloakToken(token);

      // Extract roles from token
      const roles: string[] = [];

      // kubiq authorizes only client roles; realm roles are intentionally ignored.
      if (payload.resource_access?.[keycloakConfig.clientId]?.roles) {
        roles.push(...payload.resource_access[keycloakConfig.clientId].roles);
      }

      // Create user object from token
      const username = payload.preferred_username || payload.username || payload.name || payload.sub || 'admin';
      const enrichedUser = {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        username,
        preferred_username: username,
        given_name: payload.given_name,
        family_name: payload.family_name,
        roles: [...new Set(roles)], // Remove duplicates
        type: 'keycloak'
      };

      // Cache the validated token
      tokenCache.set(token, {
        exp: payload.exp || Date.now() / 1000 + 300,
        user: enrichedUser,
      });

      // Attach user info to request
      req.user = enrichedUser;
      next();

  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }
};

// Optional: Middleware to check specific roles
export const requireRole = (...requiredRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!authProvider) {
      return res.status(503).json({
        error: 'Auth Not Configured',
        message: 'No authentication provider is enabled. Set NATIVE_AUTH_ENABLED=true or KEYCLOAK_ENABLED=true and restart.',
      });
    }

    const user = req.user as any;
    if (!user || !user.roles) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'No roles found for user',
      });
    }

    // Check if user has at least one of the required roles
    const hasRole = requiredRoles.some((role) => user.roles.includes(role));

    if (!hasRole) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `One of these roles required: ${requiredRoles.join(', ')}`,
      });
    }

    next();
  };
};

/**
 * Authoritative backend permission guard. UI visibility must never be relied on
 * for authorization because callers can invoke API routes directly.
 */
export const requirePermission = (...requiredPermissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as any;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Authentication is required.' });
    }
    const allowed = (await Promise.all(requiredPermissions.map(permission => RbacRoleService.hasPermission(user, permission)))).some(Boolean);
    if (!allowed) {
      if (requiredPermissions.includes('kubi.use')) {
        AuditLogService.getInstance().log({
          user: getUserFromReq(req), action: 'KUBI_PERMISSION_DENIED', target: 'kubi/access',
          details: `Denied kubi access; missing one of: ${requiredPermissions.join(', ')}.`, ip: req.ip,
        });
      }
      return res.status(403).json({
        error: 'RBAC_FORBIDDEN',
        message: 'Your kubiq role does not include the required permission.',
        requiredPermissions,
      });
    }
    next();
  };
};

export const checkNamespaceAccess = async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as any;
    const rawNs = req.params.ns;
    const requestedNs = Array.isArray(rawNs) ? rawNs[0] : rawNs;

    // Explicit capability, not a role-name bypass. This keeps custom roles
    // constrained unless they are deliberately granted cluster-wide scope.
    if (await RbacRoleService.hasPermission(user || {}, 'kubernetes.namespaces.all')) {
      return next();
    }

    const userId = user?.sub || user?.id;
    let allowed: string[] | undefined = undefined;

    // Fetch fresh from User repository if userId is available
    if (userId) {
      try {
        const repo = await DatabaseFactory.getUserRepository();
        const dbUser = await repo.findById(userId);
        if (dbUser && dbUser.allowedNamespaces) {
          allowed = dbUser.allowedNamespaces;
        }
      } catch {
        // Fallback
      }
    }

    if (!allowed) {
      allowed = user?.allowedNamespaces || ['apps', 'default'];
    }

    if (!requestedNs || requestedNs === 'all' || requestedNs === '*') {
      return res.status(403).json({
        error: 'RBAC_FORBIDDEN',
        message: 'A specific permitted namespace is required for this request.',
      });
    }

    if (allowed && Array.isArray(allowed) && allowed.length > 0) {
        const lowerNs = String(requestedNs).toLowerCase().trim();
        if (!allowed.map(s => String(s).toLowerCase().trim()).includes(lowerNs)) {
            return res.status(403).json({
                error: 'RBAC_FORBIDDEN',
                message: `Access denied to namespace '${requestedNs}'. Restricted by your user RBAC scope policy.`
            });
        }
    }
    next();
};

// Helper to check if user has a specific role
export const hasRole = (user: any, role: string): boolean => {
  return user?.roles?.includes(role) || false;
};

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export const getUserFromReq = (req: any): string => {
  if (!req || !req.user) return 'admin';
  return req.user.username || req.user.preferred_username || req.user.name || req.user.email || req.user.sub || 'admin';
};

export const requireAuth = authMiddleware;

