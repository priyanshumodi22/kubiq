import axios from 'axios';

type PolarLicenseKey = {
    organization_id: string;
    benefit_id: string;
    status: 'granted' | 'revoked' | 'disabled';
    expires_at: string | null;
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
        const response = await axios.post<PolarLicenseKey>(
            `${getPolarApiBaseUrl()}/v1/customer-portal/license-keys/validate`,
            { key: normalizedKey, organization_id: organizationId },
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
