
import { Request, Response } from 'express';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { DatabaseFactory } from '../database/DatabaseFactory';
import jwt from 'jsonwebtoken';

// RP = Relying Party (Your App)
const rpName = 'Kubiq Dashboard';
const rpID = process.env.RP_ID || 'localhost';
const origin = process.env.ORIGIN || 'http://localhost:5173'; // Frontend URL

// Storage for challenges (In production, use Redis. For now: Memory)
const challenges = new Map<string, string>(); // userId -> challenge

export class WebAuthnController {

  static async generateRegistrationOptions(req: Request, res: Response) {
    try {
      // User is already logged in via JWT (middleware ensures this)
      const userId = (req as any).user.sub;
      const username = (req as any).user.preferred_username;

      const passkeyRepo = await DatabaseFactory.getPasskeyRepository();
      const userPasskeys = await passkeyRepo.findByUserId(userId);

      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userID: new Uint8Array(Buffer.from(userId)),
        userName: username,
        // Don't allow re-registering the same authenticator
        excludeCredentials: userPasskeys.map(passkey => ({
          id: passkey.id,
          transports: passkey.transports as any, // Optional
        })),
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
          authenticatorAttachment: 'cross-platform', // Allow iCloud/TouchID/USB
        },
      });

      // Save challenge to verify later
      challenges.set(userId, options.challenge);

      res.json(options);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to generate registration options' });
    }
  }

  static async verifyRegistration(req: Request, res: Response) {
    try {
      const userId = (req as any).user.sub;
      const { body } = req;
      const passkeyName = body.passkeyName || 'My Passkey';

      const expectedChallenge = challenges.get(userId);
      if (!expectedChallenge) {
        return res.status(400).json({ error: 'Challenge not found or expired' });
      }

      const verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
      });

      const { verified, registrationInfo } = verification;

      if (verified && registrationInfo) {
        const passkeyRepo = await DatabaseFactory.getPasskeyRepository();
        const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;

        await passkeyRepo.create({
          id: credential.id,
          publicKey: Buffer.from(credential.publicKey).toString('base64'),
          userId: userId,
          webAuthnUserID: userId,
          name: passkeyName,
          counter: credential.counter,
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
          transports: credential.transports,
          createdAt: Date.now(),
        });

        challenges.delete(userId); // Cleanup
        res.json({ verified: true });
      } else {
        res.status(400).json({ verified: false, error: 'Verification failed' });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async generateAuthenticationOptions(req: Request, res: Response) {
    try {
      const { username } = req.body;
      if (!username) {
        return res.status(400).json({ error: 'Username required' });
      }

      // 1. Find User by Username
      const userRepo = await DatabaseFactory.getUserRepository();
      const user = await userRepo.findByUsername(username);

      if (!user) {
        // Security: Don't reveal user existence? 
        // For biometrics we kinda need to know if they have keys.
        // Let's standard error.
        return res.status(404).json({ error: 'User not found' });
      }

      // 2. Find User's Passkeys
      const passkeyRepo = await DatabaseFactory.getPasskeyRepository();
      const userPasskeys = await passkeyRepo.findByUserId(user.id);

      if (userPasskeys.length === 0) {
        return res.status(400).json({ error: 'No passkeys registered for this user' });
      }

      // 3. Generate Options
      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials: userPasskeys.map(passkey => ({
          id: passkey.id,
          transports: passkey.transports as any,
        })),
        userVerification: 'preferred',
      });

      // Save challenge (mapped to User ID temporarily to verify next step)
      // Note: In a real stateless app, we might use a signed cookie or redis
      challenges.set(user.id, options.challenge);

      res.json(options);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to generate auth options' });
    }
  }

  static async verifyAuthentication(req: Request, res: Response) {
    try {
      const { username } = req.body; // Sent back from frontend context
      const { body } = req; // The WebAuthn response

      const userRepo = await DatabaseFactory.getUserRepository();
      const user = await userRepo.findByUsername(username);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const expectedChallenge = challenges.get(user.id);
      if (!expectedChallenge) {
        return res.status(400).json({ error: 'Challenge expired' });
      }

      const passkeyRepo = await DatabaseFactory.getPasskeyRepository();
      // We need to find the SPECIFIC passkey used (credential ID is in body.id)
      const passkey = await passkeyRepo.findById(body.id);

      if (!passkey || passkey.userId !== user.id) {
        return res.status(400).json({ error: 'Credential not associated with this user' });
      }

      const verification = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: passkey.id,
          publicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64')),
          counter: passkey.counter,
          transports: passkey.transports as any,
        },
      });

      const { verified, authenticationInfo } = verification;

      if (verified && authenticationInfo) {
        // Update counter
        await passkeyRepo.updateCounter(passkey.id, authenticationInfo.newCounter);
        challenges.delete(user.id);

        // Issue JWT (Login Successful)
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

        res.json({ verified: true, token, user: { username: user.username, role: user.role, id: user.id } });
      } else {
        res.status(400).json({ verified: false, error: 'Verification failed' });
      }

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
  static async listPasskeys(req: Request, res: Response) {
    try {
      const userId = (req as any).user.sub;
      const passkeyRepo = await DatabaseFactory.getPasskeyRepository();
      const passkeys = await passkeyRepo.findByUserId(userId);
      
      const safePasskeys = passkeys.map(pk => ({
        id: pk.id,
        name: pk.name,
        deviceType: pk.deviceType,
        createdAt: pk.createdAt,
        backedUp: pk.backedUp
      }));
      
      res.json(safePasskeys);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async deletePasskey(req: Request, res: Response) {
    try {
      const userId = (req as any).user.sub;
      const id = req.params.id as string;
      
      const passkeyRepo = await DatabaseFactory.getPasskeyRepository();
      const passkey = await passkeyRepo.findById(id);
      
      if (!passkey) {
        return res.status(404).json({ error: 'Passkey not found' });
      }
      
      if (passkey.userId !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      
      await passkeyRepo.delete(id);
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async renamePasskey(req: Request, res: Response) {
    try {
      const userId = (req as any).user.sub;
      const id = req.params.id as string;
      const { name } = req.body;

      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Name is required' });
      }

      const passkeyRepo = await DatabaseFactory.getPasskeyRepository();
      const passkey = await passkeyRepo.findById(id);

      if (!passkey) {
        return res.status(404).json({ error: 'Passkey not found' });
      }

      if (passkey.userId !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      await passkeyRepo.updateName(id, name.trim());
      res.json({ success: true, name: name.trim() });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
