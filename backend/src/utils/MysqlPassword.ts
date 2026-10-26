/** One credential policy for every MySQL/MariaDB repository. Never log values. */
export function mysqlPassword(env: Readonly<NodeJS.ProcessEnv> = process.env): string {
    const password = env.DB_PASSWORD;
    const legacy = env.DB_PASS;
    if (password !== undefined && legacy !== undefined && password !== legacy) {
        throw new Error('DB_PASSWORD and DB_PASS must match when both are configured; set only one');
    }
    return password ?? legacy ?? '';
}
