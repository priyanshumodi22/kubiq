import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { User, AuthResponse } from '../types';
import { AuditLogService } from '../services/AuditLogService';
import { getUserFromReq } from '../middleware/auth';
import { RbacRoleService } from '../services/RbacRoleService';
import { getNativeJwtSecret, isNativeJwtConfigurationError } from '../utils/nativeJwt';

export class AuthController {
  private static issueNativeToken(user: User): string {
    const secret = getNativeJwtSecret();
    return jwt.sign({ sub: user.id, username: user.username, preferred_username: user.username, roles: user.roles?.length ? user.roles : [user.role], allowedNamespaces: user.allowedNamespaces || ['apps', 'default'], type: 'native' }, secret, { expiresIn: '24h' });
  }
  
  static async login(req: Request, res: Response) {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
      }

      const repo = await DatabaseFactory.getUserRepository();
      const user = await repo.findByUsername(username);

      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      if (user.enabled === false) {
        return res.status(403).json({ message: 'Contact Admin, Account is disabled.' });
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Generate JWT
      // Express invokes the route handler as an unbound function, so do not
      // depend on `this` here. Referencing the class keeps Native login usable
      // in the actual HTTP flow as well as direct controller tests.
      const token = AuthController.issueNativeToken(user);

      // Update last login
      await repo.updateLastLogin(user.id);

      AuditLogService.getInstance().log({
          user: user.username,
          action: 'AUTH_LOGIN_SUCCESS',
          target: `user/${user.username}`,
          details: `User logged in successfully`,
          ip: req.ip
      });
      
      const response: AuthResponse = {
          token,
          user: {
              ...user,
              passwordHash: undefined // Don't send hash
          }
      };

      res.json(response);

    } catch (error: any) {
      console.error('Login error:', error);
      if (isNativeJwtConfigurationError(error)) return res.status(503).json({ message: error.message });
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async refresh(req: Request, res: Response) {
    try {
      const header = String(req.headers.authorization || '');
      if (!header.startsWith('Bearer ')) return res.status(401).json({ message: 'A Native authentication token is required.' });
      const payload = jwt.verify(header.slice(7), getNativeJwtSecret()) as any;
      if (payload.type !== 'native' || !payload.sub) return res.status(401).json({ message: 'Invalid Native authentication token.' });
      const user = await (await DatabaseFactory.getUserRepository()).findById(String(payload.sub));
      if (!user || user.enabled === false) return res.status(403).json({ message: 'Account is disabled or no longer available.' });
      // Resolve current roles/scopes from persistence so revoked access takes effect at refresh.
      return res.json({ token: AuthController.issueNativeToken(user), user: { ...user, passwordHash: undefined } });
    } catch (error) {
      if (isNativeJwtConfigurationError(error)) return res.status(503).json({ message: error.message });
      return res.status(401).json({ message: 'Invalid or expired Native authentication token.' });
    }
  }

  static async register(req: Request, res: Response) {
    try {
      const { username, password, email } = req.body;

      if (!/^[a-zA-Z0-9._-]{3,100}$/.test(String(username || '')) || typeof password !== 'string' || password.length < 12) {
        return res.status(400).json({ message: 'Provide a valid username and a password of at least 12 characters.' });
      }

      const repo = await DatabaseFactory.getUserRepository();
      const existing = await repo.findByUsername(username);
      if (existing) {
        return res.status(409).json({ message: 'Username already exists' });
      }

      const saltRounds = 10;
      const hash = await bcrypt.hash(password, saltRounds);

      const newUser = await repo.createUser({
          username,
          passwordHash: hash,
          email,
          role: 'kubiq-viewer',
          roles: ['kubiq-viewer'],
      });

      res.status(201).json({ 
          message: 'User registered successfully',
          user: { 
              username: newUser.username, 
              role: newUser.role,
              id: newUser.id
          } 
      });

    } catch (error: any) {
      console.error('Register error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async me(req: Request, res: Response) {
      // Extended 'me' that handles both keycloak and native via req.user
      const user = (req as any).user;
      if (!user) {
          return res.status(401).json({ message: 'Not authenticated' });
      }
      
      // If Native
      if (user.type === 'native') {
          // Fetch fresh data from DB to ensure roles are up-to-date
          const repo = await DatabaseFactory.getUserRepository();
          const freshUser = await repo.findById(user.sub);
          
          if (!freshUser) {
              return res.status(401).json({ message: 'User no longer exists' });
          }
          
          if (freshUser.enabled === false) {
             return res.status(403).json({ message: 'Account is disabled' });
          }

          // Generate fresh token with updated roles
          let secret: string;
          try {
            secret = getNativeJwtSecret();
          } catch (error) {
            if (isNativeJwtConfigurationError(error)) return res.status(503).json({ message: error.message });
            throw error;
          }
          const token = jwt.sign(
            { 
                sub: freshUser.id, 
                username: freshUser.username,
                preferred_username: freshUser.username, 
                roles: freshUser.roles?.length ? freshUser.roles : [freshUser.role],
                allowedNamespaces: freshUser.allowedNamespaces || ['apps', 'default'],
                type: 'native'
            }, 
            secret, 
            { expiresIn: '24h' }
          );

          res.json({
              id: freshUser.id,
              username: freshUser.username,
              email: freshUser.email,
              avatarUrl: freshUser.avatarUrl,
              roles: freshUser.roles?.length ? freshUser.roles : [freshUser.role],
              permissions: await RbacRoleService.getEffectivePermissions(freshUser),
              type: 'native',
              authenticated: true,
              token // Return new token
          });
      } else {
          // Keycloak
           res.json({
            username: user.preferred_username || user.sub,
            email: user.email,
            name: user.name,
            roles: user.roles || [],
            permissions: await RbacRoleService.getEffectivePermissions(user),
            type: 'keycloak',
            authenticated: true,
          });
      }
  }


  static async updateProfile(req: Request, res: Response) {
      try {
          const userId = (req as any).user.sub;
          const { username, email, avatarUrl } = req.body;
          if ((req as any).user.type !== 'native') {
            return res.status(403).json({ message: 'Profile details are managed by your identity provider' });
          }
          
          if (!username) {
               return res.status(400).json({ message: 'Username is required' });
          }

          if (avatarUrl !== undefined && avatarUrl !== null) {
            const validAvatar = typeof avatarUrl === 'string'
              && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(avatarUrl)
              && avatarUrl.length <= 360_000;
            if (!validAvatar) {
              return res.status(400).json({ message: 'Display picture must be a PNG, JPEG, or WebP image under 250 KB.' });
            }
          }

          const repo = await DatabaseFactory.getUserRepository();
          
          // Check uniqueness if changing
          if (username) {
             const existing = await repo.findByUsername(username);
             if (existing && existing.id !== userId) {
                 return res.status(409).json({ message: 'Username already taken' });
             }
          }

          const updated = await repo.updateUser(userId, { username, email, avatarUrl: avatarUrl ?? undefined });
          
          AuditLogService.getInstance().log({
              user: getUserFromReq(req),
              action: 'AUTH_PROFILE_UPDATE',
              target: `user/${updated.username}`,
              details: `Updated user profile details`,
              ip: req.ip
          });

          res.json({
              ...updated,
              passwordHash: undefined
          });

      } catch (error: any) {
          console.error(error);
          res.status(500).json({ message: 'Internal server error' });
      }
  }

  static async changePassword(req: Request, res: Response) {
      try {
          const userId = (req as any).user.sub;
          const { currentPassword, newPassword } = req.body;
          
          if (!currentPassword || !newPassword) {
              return res.status(400).json({ message: 'Current and new password required' });
          }

          if (newPassword.length < 8) { // Basic industry standard Check
              return res.status(400).json({ message: 'Password must be at least 8 characters' });
          }

          const repo = await DatabaseFactory.getUserRepository();
          const user = await repo.findById(userId);

          if (!user || !user.passwordHash) {
              return res.status(404).json({ message: 'User not found' });
          }

          // Verify old
          const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
          if (!isValid) {
              return res.status(401).json({ message: 'Incorrect current password' });
          }

          // Hash new
          const hash = await bcrypt.hash(newPassword, 10);
          await repo.updatePassword(userId, hash);

          AuditLogService.getInstance().log({
              user: getUserFromReq(req),
              action: 'AUTH_PASSWORD_CHANGE',
              target: `user/${user.username}`,
              details: `Changed account password`,
              ip: req.ip
          });

          res.json({ message: 'Password updated successfully' });

      } catch (error) {
          console.error(error);
          res.status(500).json({ message: 'Internal server error' });
      }
  }
}
