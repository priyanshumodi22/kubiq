import { Request, Response, NextFunction } from 'express';
import { DatabaseFactory } from '../database/DatabaseFactory';
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
interface AuthenticatedUser extends jwt.JwtPayload {
  username: string;
  preferred_username: string;
  roles: string[];
  allowedNamespaces?: string[];
  type: AuthenticationProvider;
}
const nativeAuthEnabled = process.env.NATIVE_AUTH_ENABLED !== 'false';
const requestedAuthProvider = process.env.AUTH_PROVIDER?.trim().toLowerCase();
function selectAuthenticationProvider(): AuthenticationProvider | null {
  if (requestedAuthProvider === 'native' || requestedAuthProvider === 'keycloak') return requestedAuthProvider;
  if (keycloakConfig.enabled) return 'keycloak';
  return nativeAuthEnabled ? 'native' : null;
}
const authProvider = selectAuthenticationProvider();

export const getAuthenticationProvider = (): AuthenticationProvider | null => authProvider;

// Cache for validated tokens (in production, use Redis or similar)
const tokenCache = new Map<string, { exp: number; user: AuthenticatedUser }>();
const jwksCache = new Map<string, { expiresAt: number; keys: any[] }>();

import jwt from 'jsonwebtoken';

const keycloakIssuer = () => `${keycloakConfig.authServerUrl.replace(/\/$/, '')}/realms/${encodeURIComponent(keycloakConfig.realm)}`;

export const verifyKeycloakToken = async (token: string): Promise<jwt.JwtPayload> => {
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
  const payload = jwt.verify(token, key, { algorithms: ['RS256'], issuer, audience: keycloakConfig.clientId });
  if (typeof payload === 'string') throw new Error('Invalid Keycloak claims');
  return payload;
};

/** A valid signature identifies an account; it does not preserve revoked roles. */
async function resolveNativeUser(token: string): Promise<AuthenticatedUser | null> {
  const decoded = jwt.verify(token, getNativeJwtSecret());
  if (typeof decoded === 'string' || decoded.type !== 'native' || !decoded.sub) return null;
  const user = await (await DatabaseFactory.getUserRepository()).findById(decoded.sub);
  if (!user || user.enabled === false) return null;
  return {
    ...decoded,
    sub: user.id,
    username: user.username,
    preferred_username: user.username,
    roles: user.roles?.length ? user.roles : [user.role],
    allowedNamespaces: user.allowedNamespaces || ['apps', 'default'],
    type: 'native',
  };
}

async function authenticateNative(token: string, req: Request, res: Response, next: NextFunction) {
  try {
    const user = await resolveNativeUser(token);
    if (!user) return res.status(401).json({ message: 'Invalid Native authentication token or unavailable account' });
    req.user = user;
    return next();
  } catch (error_) {
    if (isNativeJwtConfigurationError(error_)) {
      return res.status(503).json({ error: 'NATIVE_JWT_SECRET_UNAVAILABLE', message: error_.message });
    }
    if (error_ instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: 'Invalid or expired Native authentication token' });
    }
    console.warn('Native account lookup unavailable; authentication denied.', error_);
    return res.status(503).json({ error: 'AUTH_LOOKUP_UNAVAILABLE', message: 'Authentication is temporarily unavailable.' });
  }
}

/** Authenticate a Socket.IO handshake with the same provider and claims used by HTTP routes. */
export const getSocketUser = async (token: unknown): Promise<AuthenticatedUser | null> => {
  if (typeof token !== 'string' || !token || !authProvider) return null;
  try {
    if (authProvider === 'native') {
      return await resolveNativeUser(token);
    }
    const payload = await verifyKeycloakToken(token);
    const roles = keycloakClientRoles(payload);
    const username = payload.preferred_username || payload.username || payload.name || payload.sub || 'admin';
    return { ...payload, username, preferred_username: username, roles: [...new Set(roles)], type: 'keycloak' };
  } catch {
    return null;
  }
};

function keycloakClientRoles(payload: jwt.JwtPayload): string[] {
  const roles: unknown = payload.resource_access?.[keycloakConfig.clientId]?.roles;
  return Array.isArray(roles) ? roles.filter((role): role is string => typeof role === 'string') : [];
}

type NamespaceUser = Partial<AuthenticatedUser> & { id?: string; role?: string };
async function resolveNamespaceScope(user: NamespaceUser | null | undefined): Promise<string[]> {
  let allowed = user?.allowedNamespaces;
  const userId = user?.sub || user?.id;
  // Native principals were freshly loaded by resolveNativeUser. Keycloak users
  // may have an additional local namespace policy, shared by HTTP and sockets.
  if (userId && user?.type !== 'native') {
    const repository = await DatabaseFactory.getUserRepository();
    const account = await repository.findById(userId);
    if (account?.allowedNamespaces !== undefined) allowed = account.allowedNamespaces;
  }
  return Array.isArray(allowed) ? allowed : ['apps', 'default'];
}

/** Namespace scope for websocket requests mirrors checkNamespaceAccess for HTTP routes. */
export const canAccessKubernetesNamespace = async (user: NamespaceUser | null | undefined, namespace: unknown): Promise<boolean> => {
  const requested = typeof namespace === 'string' ? namespace.trim().toLowerCase() : '';
  if (!requested || requested === 'all' || requested === '*') return false;
  if (await RbacRoleService.hasPermission(user ?? {}, 'kubernetes.namespaces.all')) return true;
  try {
    const allowed = await resolveNamespaceScope(user);
    return allowed.some(value => String(value).trim().toLowerCase() === requested);
  } catch (error_) {
    console.warn('Namespace scope lookup failed; socket access denied.', error_);
    return false;
  }
};

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // Check Authorization header first, then query parameter
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token;

  let token: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (typeof queryToken === 'string' && queryToken) {
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
  if (authProvider === 'native') return authenticateNative(token, req, res, next);

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
      // kubiq authorizes only client roles; realm roles are intentionally ignored.
      const roles = keycloakClientRoles(payload);

      // Create user object from token
      const username = payload.preferred_username || payload.username || payload.name || payload.sub || 'admin';
      const enrichedUser: AuthenticatedUser = {
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

    const user = req.user;
    if (!user?.roles) {
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
    const user = req.user;
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
    const user = req.user;
    const rawNs = req.params.ns;
    const requestedNs = Array.isArray(rawNs) ? rawNs[0] : rawNs;

    // Explicit capability, not a role-name bypass. This keeps custom roles
    // constrained unless they are deliberately granted cluster-wide scope.
    if (await RbacRoleService.hasPermission(user || {}, 'kubernetes.namespaces.all')) {
      return next();
    }

    let allowed: string[];
    try {
      allowed = await resolveNamespaceScope(user);
    } catch (error_) {
      console.warn('Namespace scope lookup failed; HTTP access denied.', error_);
      return res.status(503).json({ error: 'RBAC_SCOPE_UNAVAILABLE', message: 'Namespace authorization is temporarily unavailable.' });
    }

    if (!requestedNs || requestedNs === 'all' || requestedNs === '*') {
      return res.status(403).json({
        error: 'RBAC_FORBIDDEN',
        message: 'A specific permitted namespace is required for this request.',
      });
    }

    const lowerNs = String(requestedNs).toLowerCase().trim();
    if (!Array.isArray(allowed) || !allowed.map(s => String(s).toLowerCase().trim()).includes(lowerNs)) {
            return res.status(403).json({
                error: 'RBAC_FORBIDDEN',
                message: `Access denied to namespace '${requestedNs}'. Restricted by your user RBAC scope policy.`
            });
    }
    next();
};

// Helper to check if user has a specific role
export const hasRole = (user: any, role: string): boolean => {
  return user?.roles?.includes(role) || false;
};

// Extend Express Request type
declare module 'express-serve-static-core' {
  interface Request {
    user?: any;
  }
}

export const getUserFromReq = (req: any): string => {
  if (!req?.user) return 'admin';
  return req.user.username || req.user.preferred_username || req.user.name || req.user.email || req.user.sub || 'admin';
};

export const requireAuth = authMiddleware;

