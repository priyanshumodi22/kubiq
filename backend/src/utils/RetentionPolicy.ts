const MAX_TTL_SECONDS = 2_147_483_647;
const DURATION = /^(\d+)\s*(s|m|h|d|w|hrs|days?|hours?|minutes?|seconds?)$/i;

/** Resolve canonical duration settings, preserving the deployed legacy DAYS aliases. */
export function retentionSeconds(kind: 'APM' | 'LOG', env: NodeJS.ProcessEnv = process.env): number {
    const periodName = `${kind}_RETENTION_PERIOD`;
    const daysName = `${kind}_RETENTION_DAYS`;
    const period = env[periodName];
    const days = env[daysName];
    let seconds: number;
    if (period !== undefined) {
        const match = DURATION.exec(period.trim());
        if (!match) throw new Error(`${periodName} must be a duration such as 24h or 3d`);
        const unit = match[2][0].toLowerCase();
        const multiplier: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
        seconds = Number(match[1]) * multiplier[unit];
    } else if (days !== undefined) {
        if (/^\d+$/.test(days.trim())) {
            seconds = Number(days) * 86400;
        } else {
            throw new Error(`${daysName} must be a positive whole number`);
        }
    } else {
        seconds = (kind === 'APM' ? 3 : 7) * 86400;
    }
    if (!Number.isSafeInteger(seconds) || seconds <= 0 || seconds > MAX_TTL_SECONDS) {
        throw new Error(`${periodName} must resolve to 1..${MAX_TTL_SECONDS} seconds`);
    }
    return seconds;
}
