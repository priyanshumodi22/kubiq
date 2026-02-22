import { Router, Request, Response } from 'express';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { ISpan } from '../database/interfaces/ITraceRepository';

export const apmIngestRouter = Router();
export const apmAnalyticsRouter = Router();

/**
 * Parses the nested OpenTelemetry JSON format into a flat array of ISpan objects.
 */
function parseOtlpPayload(payload: any): ISpan[] {
    const spans: ISpan[] = [];

    if (!payload || !payload.resourceSpans) {
        return spans;
    }

    for (const resourceSpan of payload.resourceSpans) {
        // Extract service.name from resource attributes
        let serviceName = 'unknown-service';
        if (resourceSpan.resource?.attributes) {
            const serviceNameAttr = resourceSpan.resource.attributes.find((attr: any) => attr.key === 'service.name');
            if (serviceNameAttr && serviceNameAttr.value) {
                serviceName = serviceNameAttr.value.stringValue || 'unknown-service';
            }
        }

        if (!resourceSpan.scopeSpans) continue;

        for (const scopeSpan of resourceSpan.scopeSpans) {
            if (!scopeSpan.spans) continue;

            for (const otelSpan of scopeSpan.spans) {
                // Calculate duration in milliseconds from nano timestamps
                const startNano = Number(otelSpan.startTimeUnixNano);
                const endNano = Number(otelSpan.endTimeUnixNano);
                const durationMs = (endNano - startNano) / 1000000;

                // Parse attributes array into a key-value object
                const attributes: Record<string, any> = {};
                if (otelSpan.attributes) {
                    for (const attr of otelSpan.attributes) {
                        if (attr.value) {
                            // Extract the value regardless of its type (stringValue, intValue, etc.)
                            const valueKey = Object.keys(attr.value)[0];
                            if (valueKey) {
                                attributes[attr.key] = attr.value[valueKey];
                            }
                        }
                    }
                }

                const span: ISpan = {
                    traceId: otelSpan.traceId,
                    spanId: otelSpan.spanId,
                    parentSpanId: otelSpan.parentSpanId || null,
                    serviceName,
                    name: otelSpan.name,
                    kind: otelSpan.kind,
                    startTimeUnixNano: startNano,
                    endTimeUnixNano: endNano,
                    durationMs,
                    statusCode: otelSpan.status?.code || 0,
                    attributes,
                };

                spans.push(span);
            }
        }
    }

    return spans;
}

/**
 * POST /v1/traces
 * The standard OTLP HTTP JSON ingestion endpoint.
 */
apmIngestRouter.post('/v1/traces', async (req: Request, res: Response) => {
    try {
        const rawPayload = req.body;
        console.log('--- Incoming OTLP Payload ---');
        console.log(`Keys: ${Object.keys(rawPayload)}`);

        // 1. Flatten the massive OTLP JSON into flat span records
        const spans = parseOtlpPayload(rawPayload);
        console.log(`Parsed ${spans.length} spans from payload`);

        if (spans.length === 0) {
            res.status(202).json({ message: 'No spans found in payload' });
            return;
        }

        // 2. Insert into database using the Factory
        const traceRepository = await DatabaseFactory.getTraceRepository();
        await traceRepository.insertSpans(spans);

        // 3. Return 202 Accepted (standard for OTLP receivers)
        res.status(202).end();
    } catch (error) {
        console.error('Failed to ingest OTLP traces:', error);
        // Even if we fail, we often return 202 or 200 to clients so they don't block/retry infinitely
        // depending on strictness, but 500 is good for debugging right now
        res.status(500).json({ error: 'Internal Server Error processing traces' });
    }
});

/**
 * GET /api/apm/services
 * Retrieve aggregated metrics (RPS, Latency, Errors) for all monitored services.
 */
apmAnalyticsRouter.get('/services', async (req: Request, res: Response) => {
    try {
        const timeRangeParam = Array.isArray(req.query.timeRangeMs) ? req.query.timeRangeMs[0] : req.query.timeRangeMs;
        const timeRangeMs = parseInt(timeRangeParam as string) || 60 * 60 * 1000; // Default 1 hour
        const traceRepository = await DatabaseFactory.getTraceRepository();
        const metrics = await traceRepository.getServiceMetrics(timeRangeMs);

        // Add RPM (Requests Per Minute) calculation
        const timeRangeMinutes = timeRangeMs / 60000;
        const enrichedMetrics = metrics.map(m => ({
            ...m,
            rpm: m.requestCount / timeRangeMinutes,
            errorRate: m.requestCount > 0 ? (m.errorCount / m.requestCount) * 100 : 0
        }));

        res.json(enrichedMetrics);
    } catch (error) {
        console.error('Failed to get service metrics:', error);
        res.status(500).json({ error: 'Failed to retrieve service metrics.' });
    }
});

/**
 * GET /api/apm/services/:serviceName/recent-trace
 * Retrieve the most recent trace ID for a specific service.
 */
apmAnalyticsRouter.get('/services/:serviceName/recent-trace', async (req: Request, res: Response) => {
    try {
        const param = req.params.serviceName;
        const serviceName = Array.isArray(param) ? param[0] : param;

        const traceRepository = await DatabaseFactory.getTraceRepository();
        const traceId = await traceRepository.getRecentTraceIdForService(serviceName);

        if (!traceId) {
            res.status(404).json({ error: 'No recent traces found for this service' });
            return;
        }

        res.json({ traceId });
    } catch (error) {
        console.error(`Failed to get recent trace for ${req.params.serviceName}:`, error);
        res.status(500).json({ error: 'Failed to retrieve recent trace.' });
    }
});

/**
 * GET /api/apm/traces/:traceId
 * Retrieve the full waterfall of spans for a specific request.
 */
apmAnalyticsRouter.get('/traces/:traceId', async (req: Request, res: Response) => {
    try {
        const traceIdParam = Array.isArray(req.params.traceId) ? req.params.traceId[0] : req.params.traceId;
        const traceId = traceIdParam as string;
        const traceRepository = await DatabaseFactory.getTraceRepository();
        const spans = await traceRepository.getTraceDetails(traceId);

        if (!spans || spans.length === 0) {
            res.status(404).json({ error: 'Trace not found' });
            return;
        }

        // Additional logic could be added here to format the spans into a tree
        // if the frontend demands it, or the frontend can build the tree based on parentSpanId.
        // For now we return flat span objects.
        res.json(spans);
    } catch (error) {
        console.error(`Failed to get trace ${req.params.traceId}:`, error);
        res.status(500).json({ error: 'Failed to retrieve trace data.' });
    }
});
