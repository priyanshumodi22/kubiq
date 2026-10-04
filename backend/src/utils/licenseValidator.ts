import axios from 'axios';
import { createHash } from 'crypto';
import { DatabaseFactory } from '../database/DatabaseFactory';

type PolarLicenseKey = {
    organization_id: string;
    benefit_id: string;
    status: 'granted' | 'revoked' | 'disabled';
    expires_at: string | null;
};

type PolarLicenseActivation = {
    id: string;
};

const POLAR_API_URLS = {
    production: 'https://api.polar.sh',
    sandbox: 'https://sandbox-api.polar.sh'
} as const;

const VALIDATION_TIMEOUT_MS = 5_000;
const VALID_CACHE_TTL_MS = 5 * 60 * 1_000;
const INVALID_CACHE_TTL_MS = 30 * 1_000;

let cachedValidation: {
    key: string;
    organizationId: string;
    benefitId: string;
    valid: boolean;
    expiresAt: number;
} | null = null;

function getPolarApiBaseUrl(): string {
    const explicitUrl = process.env.POLAR_API_BASE_URL?.trim();
    if (explicitUrl) return explicitUrl.replace(/\/$/, '');

    const environment = process.env.POLAR_ENVIRONMENT?.toLowerCase() === 'sandbox'
        ? 'sandbox'
        : 'production';
    return POLAR_API_URLS[environment];
}

function isActiveLicense(license: PolarLicenseKey, organizationId: string, benefitId: string): boolean {
    if (license.status !== 'granted') return false;
    if (license.organization_id !== organizationId) return false;
    if (license.benefit_id !== benefitId) return false;

    if (license.expires_at) {
        const expiresAt = Date.parse(license.expires_at);
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
    }

    return true;
}

function fingerprintLicenseKey(licenseKey: string): string {
    return createHash('sha256').update(licenseKey).digest('hex');
}

function getActivationLabel(): string {
    const configuredLabel = process.env.KUBIQ_LICENSE_LABEL?.trim();
    if (configuredLabel) return configuredLabel.slice(0, 100);

    // This is informational in Polar only. The persisted activation ID is what
    // keeps the same deployment bound across restarts and replica rollouts.
    return `kubiq:${process.env.HOSTNAME?.trim() || 'self-hosted-server'}`.slice(0, 100);
}

async function getOrCreateActivationId(
    licenseKey: string,
    organizationId: string
): Promise<string | null> {
    const keyFingerprint = fingerprintLicenseKey(licenseKey);
    const repository = await DatabaseFactory.getSystemRepository();
    const storedActivation = await repository.getLicenseActivation();

    if (storedActivation?.keyFingerprint === keyFingerprint) {
        return storedActivation.activationId;
    }

    const response = await axios.post<PolarLicenseActivation>(
        `${getPolarApiBaseUrl()}/v1/customer-portal/license-keys/activate`,
        {
            key: licenseKey,
            organization_id: organizationId,
            label: getActivationLabel()
        },
        {
            headers: { 'Content-Type': 'application/json' },
            timeout: VALIDATION_TIMEOUT_MS,
            validateStatus: (status) => status >= 200 && status < 500
        }
    );

    if (response.status !== 200 || !response.data?.id) {
        return null;
    }

    await repository.saveLicenseActivation({ keyFingerprint, activationId: response.data.id });
    return response.data.id;
}

/**
 * Validates a kubiq Pro license against Polar's public customer license-key API.
 * Organization and benefit IDs scope keys to the kubiq Pro product without
 * embedding a privileged Polar seller token in self-hosted distributions.
 */
export async function validateLicenseKey(licenseKey: string): Promise<boolean> {
    const normalizedKey = licenseKey.trim();
    const organizationId = process.env.POLAR_ORGANIZATION_ID?.trim() || '';
    const benefitId = process.env.POLAR_LICENSE_BENEFIT_ID?.trim() || '';

    if (!normalizedKey || !organizationId || !benefitId) return false;

    if (
        cachedValidation &&
        cachedValidation.key === normalizedKey &&
        cachedValidation.organizationId === organizationId &&
        cachedValidation.benefitId === benefitId &&
        cachedValidation.expiresAt > Date.now()
    ) {
        return cachedValidation.valid;
    }

    try {
        const activationId = await getOrCreateActivationId(normalizedKey, organizationId);
        if (!activationId) {
            console.warn('Polar license activation was rejected; kubiq Pro access denied.');
            cachedValidation = {
                key: normalizedKey,
                organizationId,
                benefitId,
                valid: false,
                expiresAt: Date.now() + INVALID_CACHE_TTL_MS
            };
            return false;
        }

        const response = await axios.post<PolarLicenseKey>(
            `${getPolarApiBaseUrl()}/v1/customer-portal/license-keys/validate`,
            {
                key: normalizedKey,
                organization_id: organizationId,
                activation_id: activationId,
                benefit_id: benefitId
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: VALIDATION_TIMEOUT_MS,
                validateStatus: (status) => status >= 200 && status < 500
            }
        );

        const valid = response.status === 200 && isActiveLicense(response.data, organizationId, benefitId);
        cachedValidation = {
            key: normalizedKey,
            organizationId,
            benefitId,
            valid,
            expiresAt: Date.now() + (valid ? VALID_CACHE_TTL_MS : INVALID_CACHE_TTL_MS)
        };
        return valid;
    } catch (error) {
        const reason = axios.isAxiosError(error) ? error.code || 'request_failed' : 'unexpected_error';
        console.warn(`Polar license validation unavailable (${reason}); kubiq Pro access denied.`);
        return false;
    }
}
