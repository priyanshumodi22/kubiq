import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { User, AuthResponse } from '../types';

export class AuthController {
  
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
      const secret = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod';
      const token = jwt.sign(
        { 
            sub: user.id, 
            preferred_username: user.username, 
            roles: [user.role],
            type: 'native'
        }, 
        secret, 
        { expiresIn: '24h' }
      );

      // Update last login
      await repo.updateLastLogin(user.id);
      
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
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async register(req: Request, res: Response) {
    try {
      const { username, password, email } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
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
          role: 'kubiq-viewer' // Default role
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
          const secret = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod';
          const token = jwt.sign(
            { 
                sub: freshUser.id, 
                preferred_username: freshUser.username, 
                roles: [freshUser.role],
                type: 'native'
            }, 
            secret, 
            { expiresIn: '24h' }
          );

          res.json({
              id: freshUser.id,
              username: freshUser.username,
              email: freshUser.email,
              roles: [freshUser.role], // Fresh role from DB
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
            type: 'keycloak',
            authenticated: true,
          });
      }
  }


  static async updateProfile(req: Request, res: Response) {
      try {
          const userId = (req as any).user.sub;
          const { username, email } = req.body;
          
          if (!username) {
               return res.status(400).json({ message: 'Username is required' });
          }

          const repo = await DatabaseFactory.getUserRepository();
          
          // Check uniqueness if changing
          if (username) {
             const existing = await repo.findByUsername(username);
             if (existing && existing.id !== userId) {
                 return res.status(409).json({ message: 'Username already taken' });
             }
          }

          const updated = await repo.updateUser(userId, { username, email });
          
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

          if (!user ||!user.passwordHash) {
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

          res.json({ message: 'Password updated successfully' });

      } catch (error) {
          console.error(error);
          res.status(500).json({ message: 'Internal server error' });
      }
  }
}
