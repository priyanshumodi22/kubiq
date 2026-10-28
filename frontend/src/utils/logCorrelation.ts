export interface LogCorrelation { traceId: string; spanId?: string }
const validTrace = (value: unknown): value is string => typeof value === 'string' && /^(?:[a-f0-9]{16}|[a-f0-9]{32})$/i.test(value) && !/^0+$/.test(value);
const validSpan = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{16}$/i.test(value) && !/^0+$/.test(value);
function fields(value: unknown, depth = 0): LogCorrelation | null {
    if (depth > 2 || !value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const traceId = record.traceId ?? record.trace_id ?? record['trace.id'] ?? record.TraceId;
    const spanId = record.spanId ?? record.span_id ?? record['span.id'] ?? record.SpanId;
    if (validTrace(traceId)) return { traceId: traceId.toLowerCase(), spanId: validSpan(spanId) ? spanId.toLowerCase() : undefined };
    if (record.metadata && typeof record.metadata === 'object') return fields(record.metadata, depth + 1);
    return null;
}
export function logCorrelation(message: string, record?: unknown): LogCorrelation | null {
    const structured = fields(record);
    if (structured) return structured;
    const bounded = message.slice(0, 32768);
    const start = bounded.indexOf('{'), end = bounded.lastIndexOf('}');
    if (start >= 0 && end > start) {
        try { const parsed = fields(JSON.parse(bounded.slice(start, end + 1))); if (parsed) return parsed; }
        catch { /* Plain-text log formats are supported below. */ }
    }
    const traceId = /(?:^|[\s,"'{])(?:traceId|trace_id|trace\.id)["']?\s*[:=]\s*["']?([a-f0-9]{16}(?:[a-f0-9]{16})?)(?![a-f0-9])/i.exec(bounded)?.[1];
    const spanId = /(?:^|[\s,"'{])(?:spanId|span_id|span\.id)["']?\s*[:=]\s*["']?([a-f0-9]{16})(?![a-f0-9])/i.exec(bounded)?.[1];
    if (!validTrace(traceId)) return null;
    return { traceId: traceId.toLowerCase(), spanId: validSpan(spanId) ? spanId.toLowerCase() : undefined };
}
