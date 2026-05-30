import axios from 'axios';

/**
 * Validates a kubiq Pro license key.
 * In a real-world scenario, this would call the Polar.sh API.
 */
export async function validateLicenseKey(licenseKey: string): Promise<boolean> {
    if (!licenseKey) return false;

    // Local stub: Any key starting with 'kubiq_' is considered valid for testing.
    // In production, replace this with a real Polar.sh API call.
    // Example:
    // const res = await axios.post('https://api.polar.sh/v1/benefits/grants', { license_key: licenseKey });
    // return res.data.active === true;

    return licenseKey.startsWith('kubiq_');
}
