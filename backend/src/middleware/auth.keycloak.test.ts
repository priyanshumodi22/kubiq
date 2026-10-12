import axios from 'axios';
import jwt from 'jsonwebtoken';
import { generateKeyPairSync } from 'crypto';
import { describe, expect, it, jest } from '@jest/globals';
import { verifyKeycloakToken } from './auth';

const issuer = 'http://localhost:8080/auth/realms/kubiq';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;

describe('Keycloak JWT verification', () => {
  it('requires the Keycloak RS256 signature, issuer, audience and expiry', async () => {
    jest.spyOn(axios, 'get').mockResolvedValueOnce({ data: { keys: [{ ...jwk, kid: 'kubiq-test-key', kty: 'RSA' }] } } as any);
    const valid = jwt.sign({ sub: 'user-1', resource_access: { 'kubiq-dashboard': { roles: ['kubiq-user'] } } }, privateKey, { algorithm: 'RS256', keyid: 'kubiq-test-key', issuer, audience: 'kubiq-dashboard', expiresIn: '5m' });
    await expect(verifyKeycloakToken(valid)).resolves.toMatchObject({ sub: 'user-1' });

    const wrongAudience = jwt.sign({ sub: 'user-1' }, privateKey, { algorithm: 'RS256', keyid: 'kubiq-test-key', issuer, audience: 'another-client', expiresIn: '5m' });
    await expect(verifyKeycloakToken(wrongAudience)).rejects.toThrow();

    const expired = jwt.sign({ sub: 'user-1' }, privateKey, { algorithm: 'RS256', keyid: 'kubiq-test-key', issuer, audience: 'kubiq-dashboard', expiresIn: -1 });
    await expect(verifyKeycloakToken(expired)).rejects.toThrow();
  });
});
