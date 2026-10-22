export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'plain';

const EXPLICIT_LEVEL_PATTERNS = [
    /\[(ERROR|WARN|WARNING|INFO|DEBUG|TRACE|FATAL|PANIC|CRITICAL)\]/i,
    /\b(?:level|severity|lvl)["']?\s*[:=]\s*["']?(error|warn|warning|info|debug|trace|fatal|panic|critical)\b/i,
    /^(?:[\d-T:.Z\s+]+)?\b(ERROR|WARN|WARNING|INFO|DEBUG|TRACE|FATAL|PANIC|CRITICAL)\b/i,
] as const;

export function classifyLogLevel(content: string): LogLevel {
    const explicitLevel = EXPLICIT_LEVEL_PATTERNS
        .map((pattern) => pattern.exec(content)?.[1])
        .find((level) => level !== undefined)
        ?.toLowerCase();

    if (!explicitLevel) return 'plain';
    if (['error', 'fatal', 'panic', 'critical'].includes(explicitLevel)) return 'error';
    if (['warn', 'warning'].includes(explicitLevel)) return 'warn';
    if (explicitLevel === 'info') return 'info';
    if (['debug', 'trace'].includes(explicitLevel)) return 'debug';
    return 'plain';
}
