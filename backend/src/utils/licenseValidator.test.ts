import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { validateLicenseKey } from './licenseValidator';

jest.mock('axios');
jest.mock('../database/DatabaseFactory', () => ({
    DatabaseFactory: { getSystemRepository: jest.fn() }
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedDatabaseFactory = DatabaseFactory as jest.Mocked<typeof DatabaseFactory>;
const storedActivations = new Map<string, string>();

describe('validateLicenseKey', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.POLAR_ENVIRONMENT = 'sandbox';
        process.env.POLAR_ORGANIZATION_ID = 'org-kubiq';
        process.env.POLAR_LICENSE_BENEFIT_ID = 'benefit-pro';
        storedActivations.clear();
        mockedDatabaseFactory.getSystemRepository.mockResolvedValue({
            getLicenseActivation: jest.fn(async () => {
                const [keyFingerprint, activationId] = [...storedActivations.entries()][0] || [];
                return keyFingerprint && activationId ? { keyFingerprint, activationId } : null;
            }),
            saveLicenseActivation: jest.fn(async ({ keyFingerprint, activationId }) => {
                storedActivations.set(keyFingerprint, activationId);
            })
        } as never);
    });

    afterEach(() => {
        delete process.env.POLAR_API_BASE_URL;
        delete process.env.POLAR_ENVIRONMENT;
        delete process.env.POLAR_ORGANIZATION_ID;
        delete process.env.POLAR_LICENSE_BENEFIT_ID;
    });

    it('accepts an active kubiq Pro key from Polar sandbox', async () => {
        mockedAxios.post.mockResolvedValueOnce({
            status: 200,
            data: { id: 'activation-1' }
        } as never).mockResolvedValueOnce({
            status: 200,
            data: {
                organization_id: 'org-kubiq',
                benefit_id: 'benefit-pro',
                status: 'granted',
                expires_at: null
            }
        } as never);

        await expect(validateLicenseKey('KUBIQ_PRO_TEST')).resolves.toBe(true);
        expect(mockedAxios.post).toHaveBeenCalledWith(
            'https://sandbox-api.polar.sh/v1/customer-portal/license-keys/validate',
            expect.objectContaining({
                key: 'KUBIQ_PRO_TEST',
                organization_id: 'org-kubiq',
                activation_id: 'activation-1',
                benefit_id: 'benefit-pro'
            }),
            expect.objectContaining({ timeout: 5_000 })
        );
    });

    it('rejects keys issued for another benefit', async () => {
        mockedAxios.post.mockResolvedValueOnce({
            status: 200,
            data: { id: 'activation-wrong-benefit' }
        } as never).mockResolvedValueOnce({
            status: 200,
            data: {
                organization_id: 'org-kubiq',
                benefit_id: 'another-benefit',
                status: 'granted',
                expires_at: null
            }
        } as never);

        await expect(validateLicenseKey('KUBIQ_WRONG_BENEFIT')).resolves.toBe(false);
    });

    it('rejects revoked and expired licenses', async () => {
        mockedAxios.post
            .mockResolvedValueOnce({
                status: 200,
                data: { id: 'activation-revoked' }
            } as never)
            .mockResolvedValueOnce({
                status: 200,
                data: {
                    organization_id: 'org-kubiq',
                    benefit_id: 'benefit-pro',
                    status: 'revoked',
                    expires_at: null
                }
            } as never)
            .mockResolvedValueOnce({
                status: 200,
                data: { id: 'activation-expired' }
            } as never)
            .mockResolvedValueOnce({
                status: 200,
                data: {
                    organization_id: 'org-kubiq',
                    benefit_id: 'benefit-pro',
                    status: 'granted',
                    expires_at: '2020-01-01T00:00:00.000Z'
                }
            } as never);

        await expect(validateLicenseKey('KUBIQ_REVOKED')).resolves.toBe(false);
        await expect(validateLicenseKey('KUBIQ_EXPIRED')).resolves.toBe(false);
    });

    it('fails closed when Polar configuration is incomplete', async () => {
        delete process.env.POLAR_LICENSE_BENEFIT_ID;

        await expect(validateLicenseKey('KUBIQ_UNCONFIGURED')).resolves.toBe(false);
        expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('fails closed when Polar is unavailable', async () => {
        mockedAxios.post.mockRejectedValueOnce(new Error('network unavailable'));

        await expect(validateLicenseKey('KUBIQ_NETWORK_ERROR')).resolves.toBe(false);
    });
});
