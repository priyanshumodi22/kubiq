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
    // If auth is disabled completely? No, logic says skip if not enabled. 
    // But now we have TWO providers.
    // If Keycloak disabled AND Native disabled (implied?), then skip?
    // Let's assume protection is required if middleware is used.
    if (!keycloakConfig.enabled && process.env.AUTH_PROVIDER !== 'kubiq') {
        return next();
    }
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No valid authorization token provided',
    });
  }

  // 1. Try Native Auth (JWT Verify)
  try {
      const secret = process.env.JWT_SECRET;
      if (secret) {
          const decoded = jwt.verify(token, secret) as any;
          if (decoded && decoded.type === 'native') {
              req.user = decoded; // { sub, preferred_username, roles, type }
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
      const enrichedUser = {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        preferred_username: payload.preferred_username,
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
    if (!keycloakConfig.enabled) {
      return next();
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

export const requireAuth = authMiddleware;
