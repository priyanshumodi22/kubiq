import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { trace } from '@opentelemetry/api';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { IngestionBufferService } from '../services/IngestionBufferService';
const correlatedResponses = new WeakSet<object>();
export const hasCorrelatedRequest = (response: object): boolean => correlatedResponses.has(response);
const requestScope = new AsyncLocalStorage<{ active: boolean }>();
export interface LogSpanContext { traceId: string; spanId: string }
export function withRequestLogScope(response: Response, action: () => void): void {
    if (!trace.getActiveSpan()) { action(); return; }
    correlatedResponses.add(response);
    const scope = { active: true };
    const finish = () => { scope.active = false; response.removeListener('finish', finish); response.removeListener('close', finish); };
    response.once('finish', finish); response.once('close', finish);
    requestScope.run(scope, action);
}
/** Emit the same event to stdout and bounded retention; never monkey-patch console. */
export function emitCorrelatedEvent(record: Record<string, string | number>, context: LogSpanContext, sourceName: string, level = 'INFO'): void {
    try {
        const eventId = randomUUID();
        const timestamp = new Date();
        const message = JSON.stringify({ ...record, level, event_id: eventId, timestamp: timestamp.toISOString(), service: 'kubiq-backend', trace_id: context.traceId, span_id: context.spanId });
        console.info(message);
        if (!DatabaseFactory.isLogStorageSupported()) return;
        const log = { serviceName: 'kubiq-backend', sourceName, timestamp, level, message, traceId: context.traceId, spanId: context.spanId, eventId, metadata: { traceId: context.traceId, spanId: context.spanId, eventId } };
        if (!IngestionBufferService.getInstance().addLogs([log])) console.warn('[logs] correlated_event_dropped', { count: 1 });
    } catch { console.warn('[logs] correlated_event_dropped', { count: 1 }); }
}
/** Safe application events inherit the actual active span, including child spans. */
export function logApplicationEvent(event: string, fields: { action?: string; error_type?: string } = {}, level = 'INFO'): void {
    const context = trace.getActiveSpan()?.spanContext();
    if (!/^[a-z][a-z0-9_]{0,79}$/.test(event)) return;
    const safe: Record<string, string> = { event };
    for (const key of ['action', 'error_type'] as const) {
        const value = fields[key];
        if (value && /^[A-Za-z_]{1,80}$/.test(value)) safe[key] = value;
    }
    if (!requestScope.getStore()?.active || !context?.traceId) {
        console.info(JSON.stringify({ ...safe, level, service: 'kubiq-backend', timestamp: new Date().toISOString() }));
        return;
    }
    emitCorrelatedEvent(safe, context, 'application', level);
}
