export function normalizedTraceId(value: unknown): string {
    if (typeof value !== 'string' || !/^(?:[a-f0-9]{16}|[a-f0-9]{32})$/i.test(value) || /^0+$/.test(value)) return '';
    return value.toLowerCase();
}
export function traceIdFromRecord(value: unknown): string {
    if (!value || typeof value !== 'object') return '';
    const record = value as Record<string, unknown>;
    const metadata = record.metadata && typeof record.metadata === 'object' ? record.metadata as Record<string, unknown> : {};
    return normalizedTraceId(record.traceId) || normalizedTraceId(record.trace_id) || normalizedTraceId(record.TraceId) || normalizedTraceId(metadata.traceId) || normalizedTraceId(metadata.trace_id) || normalizedTraceId(metadata.TraceId);
}
export function traceMessagePattern(value: string): string {
    const id = normalizedTraceId(value);
    if (!id) throw new Error('A valid trace ID is required.');
    return `(^|[^0-9a-f])${id}([^0-9a-f]|$)`;
}

export function normalizedSpanId(value: unknown): string {
    return typeof value === 'string' && /^[a-f0-9]{16}$/i.test(value) && !/^0+$/.test(value) ? value.toLowerCase() : '';
}
export function spanIdFromRecord(value: unknown): string {
    if (!value || typeof value !== 'object') return '';
    const record = value as Record<string, unknown>;
    const metadata = record.metadata && typeof record.metadata === 'object' ? record.metadata as Record<string, unknown> : {};
    return normalizedSpanId(record.spanId) || normalizedSpanId(record.span_id) || normalizedSpanId(record.SpanId) || normalizedSpanId(metadata.spanId) || normalizedSpanId(metadata.span_id) || normalizedSpanId(metadata.SpanId);
}
export function contextFromLogLine(message: string): { traceId: string; spanId: string; eventId?: string; timestamp?: Date } {
    const bounded = message.slice(0, 32768);
    const start = bounded.indexOf('{'), end = bounded.lastIndexOf('}');
    if (start >= 0 && end > start) {
        try {
            const record: unknown = JSON.parse(bounded.slice(start, end + 1));
            const traceId = traceIdFromRecord(record);
            if (traceId) return { traceId, spanId: spanIdFromRecord(record), eventId: eventIdFromRecord(record) || undefined, timestamp: eventTimestamp(record) };
        } catch { /* Non-JSON log formats use validated named fields below. */ }
    }
    const traceId = normalizedTraceId(/(?:^|[\s,"'{])(?:traceId|trace_id|trace\.id)["']?\s*[:=]\s*["']?([a-f0-9]{16}(?:[a-f0-9]{16})?)(?![a-f0-9])/i.exec(bounded)?.[1]);
    const spanId = normalizedSpanId(/(?:^|[\s,"'{])(?:spanId|span_id|span\.id)["']?\s*[:=]\s*["']?([a-f0-9]{16})(?![a-f0-9])/i.exec(bounded)?.[1]);
    return { traceId, spanId: traceId ? spanId : '' };
}

export function eventIdFromRecord(value: unknown): string {
    if (!value || typeof value !== 'object') return '';
    const record = value as Record<string, unknown>;
    const id = record.eventId ?? record.event_id;
    return typeof id === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) ? id.toLowerCase() : '';
}
export function uniqueLogEvents<T>(logs: T[]): T[] {
    const seen = new Set<string>();
    return logs.filter(log => {
        const id = eventIdFromRecord(log);
        if (!id) return true;
        if (seen.has(id)) return false;
        seen.add(id); return true;
    });
}

function eventTimestamp(value: unknown): Date | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const timestamp = (value as Record<string, unknown>).timestamp;
    if (typeof timestamp !== 'string' || timestamp.length > 40) return undefined;
    const time = Date.parse(timestamp);
    return Number.isFinite(time) && time <= Date.now() + 300000 ? new Date(time) : undefined;
}
