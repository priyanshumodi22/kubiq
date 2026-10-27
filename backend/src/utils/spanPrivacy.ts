import { queryDetails } from '../telemetry/databaseSpan';
const credentialKeys = [/password|passwd|pwd|secret|token|authorization|cookie/i, /api[_-]?key|private[_-]?key|credential/i];
function redactStatement(value: unknown): string {
    const sanitized = queryDetails(value);
    if (typeof value !== 'string' || value.trimStart().startsWith('{') || value.trimStart().startsWith('[')) return sanitized;
    try {
        const parsed: unknown = JSON.parse(sanitized);
        if (parsed && typeof parsed === 'object' && 'statement' in parsed && typeof parsed.statement === 'string') return parsed.statement;
    } catch { /* Retain the safe failure marker, never the original text. */ }
    return sanitized;
}
/** The same storage-independent boundary protects new ingestion and historical reads/exports. */
export function privateSpanAttributes(attributes: Record<string, unknown> = {}): Record<string, unknown> {
    return Object.fromEntries(Object.entries(attributes).map(([key, value]) => {
        if (['db.statement', 'db.query.text'].includes(key)) return [key, redactStatement(value)];
        if (credentialKeys.some(pattern => pattern.test(key)) || /^db\.(?:statement|query)\.(?:parameters|params)$/.test(key)) return [key, '[REDACTED]'];
        return [key, value];
    }));
}
