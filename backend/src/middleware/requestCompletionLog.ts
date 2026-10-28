import type { Request, Response } from 'express';
import { trace } from '@opentelemetry/api';
import { emitCorrelatedEvent } from '../telemetry/correlatedLogger';

/** Real HTTP completion events; never reconstruct logs from stored span attributes. */
export function requestCompletionLog(request: Request, response: Response, route: () => string): void {
    const context = trace.getActiveSpan()?.spanContext();
    if (!context || !/^[a-f0-9]{32}$/i.test(context.traceId) || !/^[a-f0-9]{16}$/i.test(context.spanId)) return;
    const started = performance.now();
    let finished = false;
    const complete = () => {
        if (finished) return;
        finished = true;
        response.removeListener('finish', complete); response.removeListener('close', complete);
        try {
            const record = { event: 'http_request_completed', service: 'kubiq-backend', trace_id: context.traceId, span_id: context.spanId,
            method: /^[A-Z]{1,16}$/.test(request.method) ? request.method : 'OTHER', route: route(), status_code: response.statusCode,
            duration_ms: Math.round((performance.now() - started) * 100) / 100, outcome: response.writableFinished ? 'completed' : 'aborted' };
            emitCorrelatedEvent(record, context, 'http-requests', response.statusCode >= 500 ? 'ERROR' : 'INFO');
        } catch { console.warn('[logs] request_completion_dropped', { count: 1 }); }
    };
    response.once('finish', complete); response.once('close', complete);
}
