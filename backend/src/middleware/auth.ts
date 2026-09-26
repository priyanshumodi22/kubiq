import { Request, Response, NextFunction } from 'express';

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

// Cache for validated tokens (in production, use Redis or similar)
const tokenCache = new Map<string, { exp: number; user: any }>();

import jwt from 'jsonwebtoken';

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
    const nativeAuthEnabled = process.env.NATIVE_AUTH_ENABLED !== 'false';
    // If no auth provider is configured, reject with a configuration error — never bypass
    if (!keycloakConfig.enabled && !nativeAuthEnabled) {
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

  // 1. Try Native Auth (JWT Verify)
  try {
      const secret = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod';
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
      // Ignore error, try Keycloak next
  }

  // 2. Try Keycloak (Existing logic)
  if (!keycloakConfig.enabled) {
      return res.status(401).json({ message: 'Native auth failed and Keycloak disabled' });
  }

  try {
    // Check cache first
    const cached = tokenCache.get(token);
    if (cached && cached.exp > Date.now() / 1000) {
      req.user = cached.user;
      return next();
    }

    // Decode (Keycloak)
      const tokenParts = token.split('.');
      if (tokenParts.length !== 3) {
        throw new Error('Invalid token format');
      }

      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());

      // Check token expiration
      if (payload.exp && payload.exp < Date.now() / 1000) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Token has expired',
        });
      }

      // Extract roles from token
      const roles: string[] = [];

      // Get realm roles
      if (payload.realm_access?.roles) {
        roles.push(...payload.realm_access.roles);
      }

      // Get client-specific roles
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
    const nativeAuthEnabled = process.env.NATIVE_AUTH_ENABLED !== 'false';
    if (!keycloakConfig.enabled && !nativeAuthEnabled) {
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

export const checkNamespaceAccess = (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as any;
    const requestedNs = req.params.ns;

    if (user && Array.isArray(user.allowedNamespaces) && user.allowedNamespaces.length > 0 && requestedNs) {
        if (!user.allowedNamespaces.includes(requestedNs)) {
            return res.status(403).json({
                error: 'RBAC_FORBIDDEN',
                message: `Access to namespace '${requestedNs}' is restricted by your user RBAC policy. Allowed: ${user.allowedNamespaces.join(', ')}`
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

