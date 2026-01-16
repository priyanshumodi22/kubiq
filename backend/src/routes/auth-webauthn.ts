
import express from 'express';
import { WebAuthnController } from '../controllers/WebAuthnController';
import { requireAuth } from '../middleware/auth';

const router = express.Router();

// Registration (Requires Auth)
router.get('/register/options', requireAuth, WebAuthnController.generateRegistrationOptions);
router.post('/register/verify', requireAuth, WebAuthnController.verifyRegistration);

// Authentication (Public)
router.post('/login/options', WebAuthnController.generateAuthenticationOptions);
router.post('/login/verify', WebAuthnController.verifyAuthentication);

// Management
router.get('/passkeys', requireAuth, WebAuthnController.listPasskeys);
router.put('/passkeys/:id', requireAuth, WebAuthnController.renamePasskey);
router.delete('/passkeys/:id', requireAuth, WebAuthnController.deletePasskey);

export default router;
