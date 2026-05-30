export function parseTTLToSeconds(ttlStr: string | undefined, defaultSeconds: number = 7 * 24 * 60 * 60): number {
    if (!ttlStr) return defaultSeconds;
    
    const match = ttlStr.trim().match(/^(\d+)\s*(s|m|h|d|w|hrs|days?|hours?|minutes?|seconds?)$/i);
    if (!match) return defaultSeconds;
    
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    
    if (unit.startsWith('s')) return value;
    if (unit.startsWith('m')) return value * 60;
    if (unit.startsWith('h')) return value * 60 * 60;
    if (unit.startsWith('d')) return value * 24 * 60 * 60;
    if (unit.startsWith('w')) return value * 7 * 24 * 60 * 60;
    
    return defaultSeconds;
}
