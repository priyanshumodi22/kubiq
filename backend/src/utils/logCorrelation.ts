export function normalizedTraceId(value: unknown): string {
    if (typeof value !== 'string' || !/^(?:[a-f0-9]{16}|[a-f0-9]{32})$/i.test(value) || /^0+$/.test(value)) return '';
    return value.toLowerCase();
}
export function traceIdFromRecord(value: unknown): string {
    if (!value || typeof value !== 'object') return '';
    const record = value as Record<string, unknown>;
    const metadata = record.metadata && typeof record.metadata === 'object' ? record.metadata as Record<string, unknown> : {};
    return normalizedTraceId(record.traceId) || normalizedTraceId(record.trace_id) || normalizedTraceId(metadata.traceId) || normalizedTraceId(metadata.trace_id);
}
export function traceMessagePattern(value: string): string {
    const id = normalizedTraceId(value);
    if (!id) throw new Error('A valid trace ID is required.');
    return `(^|[^0-9a-f])${id}([^0-9a-f]|$)`;
}
