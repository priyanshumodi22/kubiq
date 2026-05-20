import { Router, Request, Response } from 'express';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { ISpan } from '../database/interfaces/ITraceRepository';

export const apmIngestRouter = Router();
export const apmAnalyticsRouter = Router();

let cachedApmConfig: { ignoredRoutes: string[] } | null = null;
let lastApmConfigFetch = 0;

async function getApmConfigCached(): Promise<{ ignoredRoutes: string[] }> {
    const now = Date.now();
    if (!cachedApmConfig || now - lastApmConfigFetch > 60000) { // 1 min cache
        const systemRepo = await DatabaseFactory.getSystemRepository();
        cachedApmConfig = await systemRepo.getApmConfig();
        lastApmConfigFetch = now;
    }
    return cachedApmConfig!;
}

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

        // 2. Filter out ignored routes to save DB space
        const config = await getApmConfigCached();
        const ignoredPaths = config.ignoredRoutes;
        
        const traceIdsToDrop = new Set(
            spans
              .filter(span => ignoredPaths.some(p => span.name.includes(p) || span.attributes?.['http.target']?.includes(p)))
              .map(span => span.traceId)
        );
        
        const cleanSpans = spans.filter(span => !traceIdsToDrop.has(span.traceId));

        if (cleanSpans.length === 0) {
            res.status(202).json({ message: 'All spans ignored' });
            return;
        }

        // 3. Insert into database using the Factory
        const traceRepository = await DatabaseFactory.getTraceRepository();
        await traceRepository.insertSpans(cleanSpans);

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
 * POST /api/apm/v1/zipkin
 * Dedicated Zipkin v2 JSON endpoint for Java Agents that cannot send OTLP/HTTP JSON
 */
apmIngestRouter.post('/v1/zipkin', async (req: Request, res: Response) => {
    try {
        const rawPayload = req.body;
        console.log('--- Incoming Zipkin v2 Payload ---');

        if (!Array.isArray(rawPayload)) {
            res.status(400).json({ error: 'Zipkin payload must be a JSON array' });
            return;
        }

        const spans: ISpan[] = rawPayload.map((zSpan: any) => {
            const startNano = Number(zSpan.timestamp || 0) * 1000;
            const durationMs = Number(zSpan.duration || 0) / 1000;
            const endNano = startNano + (Number(zSpan.duration || 0) * 1000);

            // Create flat attribute map from Zipkin tags
            const attributes: Record<string, any> = { ...zSpan.tags };

            return {
                traceId: zSpan.traceId,
                spanId: zSpan.id,
                parentSpanId: zSpan.parentId || null,
                serviceName: zSpan.localEndpoint?.serviceName || 'unknown-java-service',
                name: zSpan.name,
                kind: zSpan.kind || 'SPAN_KIND_INTERNAL',
                startTimeUnixNano: startNano,
                endTimeUnixNano: endNano,
                durationMs,
                // Zipkin conventions often use error tag to signify exceptions
                statusCode: zSpan.tags?.error ? 2 : 0,
                attributes
            };
        });

        console.log(`Parsed ${spans.length} Zipkin spans from payload`);

        if (spans.length === 0) {
            res.status(202).json({ message: 'No spans found' });
            return;
        }

        const config = await getApmConfigCached();
        const ignoredPaths = config.ignoredRoutes;
        
        const traceIdsToDrop = new Set(
            spans
              .filter(span => span.parentSpanId === null && ignoredPaths.some(p => span.name.includes(p) || span.attributes?.['http.target']?.includes(p)))
              .map(span => span.traceId)
        );
        
        const cleanSpans = spans.filter(span => !traceIdsToDrop.has(span.traceId));

        if (cleanSpans.length === 0) {
            res.status(202).json({ message: 'All spans ignored' });
            return;
        }

        const traceRepository = await DatabaseFactory.getTraceRepository();
        await traceRepository.insertSpans(cleanSpans);

        res.status(202).end();
    } catch (error) {
        console.error('Failed to ingest Zipkin traces:', error);
        res.status(500).json({ error: 'Internal Server Error processing zipkin traces' });
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
 * GET /api/apm/services/:serviceName/traces
 * Retrieve a list of recent traces for a specific service to populate the UI dropdown.
 */
apmAnalyticsRouter.get('/services/:serviceName/traces', async (req: Request, res: Response) => {
    try {
        const param = req.params.serviceName;
        const serviceName = Array.isArray(param) ? param[0] : param;
        const limitParam = req.query.limit;
        const limit = limitParam ? parseInt(limitParam as string, 10) : 50;

        const minDurationMs = req.query.minDuration ? parseInt(req.query.minDuration as string, 10) : undefined;
        const errorOnly = req.query.errorOnly === 'true';
        const attributeSearch = req.query.search ? (req.query.search as string) : undefined;

        const traceRepository = await DatabaseFactory.getTraceRepository();
        const traces = await traceRepository.getRecentTraces(serviceName, limit, minDurationMs, errorOnly, attributeSearch);

        res.json(traces);
    } catch (error) {
        console.error(`Failed to get recent traces for ${req.params.serviceName}:`, error);
        res.status(500).json({ error: 'Failed to retrieve recent traces list.' });
    }
});

/**
 * GET /api/apm/edges/:source/:target/recent-trace
 * Retrieve the most recent trace ID that traverses a specific service-to-service edge.
 */
apmAnalyticsRouter.get('/edges/:source/:target/recent-trace', async (req: Request, res: Response) => {
    try {
        const source = req.params.source as string;
        const target = req.params.target as string;
        const traceRepository = await DatabaseFactory.getTraceRepository();
        const traceId = await traceRepository.getRecentTraceIdForEdge(source, target);

        if (!traceId) {
            res.status(404).json({ error: 'No recent traces found for this edge' });
            return;
        }

        res.json({ traceId });
    } catch (error) {
        console.error(`Failed to get recent trace for edge ${req.params.source}->${req.params.target}:`, error);
        res.status(500).json({ error: 'Failed to retrieve recent trace for edge.' });
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

/**
 * GET /api/apm/service-map
 * Retrieves aggregated service dependencies based on parent-child span relationships.
 * Query Params: ?timeRange=3600000 (default 1 hour)
 */
apmAnalyticsRouter.get('/service-map', async (req: Request, res: Response) => {
    try {
        const timeRangeMs = parseInt(req.query.timeRange as string) || 60 * 60 * 1000;
        const traceRepository = await DatabaseFactory.getTraceRepository();

        const dependencies = await traceRepository.getServiceDependencies(timeRangeMs);
        res.json(dependencies);
    } catch (error) {
        console.error('Failed to get service dependencies:', error);
        res.status(500).json({ error: 'Failed to retrieve service map data.' });
    }
});

/**
 * GET /api/apm/export
 * Export slow query spans as a downloadable CSV file.
 * All query params are optional and are AND-ed together:
 *   - from        ISO datetime string (e.g. 2026-05-20T17:03:55)
 *   - to          ISO datetime string (e.g. 2026-05-20T17:08:30)
 *   - service     service name filter
 *   - minDuration minimum span duration in ms
 *   - errorOnly   'true' to include only error spans
 *   - search      partial match on span name
 */
apmAnalyticsRouter.get('/export', async (req: Request, res: Response) => {
    try {
        const fromParam = req.query.from as string | undefined;
        const toParam = req.query.to as string | undefined;
        const serviceName = req.query.service as string | undefined;
        const minDurationMs = req.query.minDuration ? parseInt(req.query.minDuration as string, 10) : undefined;
        const errorOnly = req.query.errorOnly === 'true';
        const spanNameSearch = req.query.search as string | undefined;

        const fromTime = fromParam ? new Date(fromParam) : undefined;
        const toTime = toParam ? new Date(toParam) : undefined;

        const traceRepository = await DatabaseFactory.getTraceRepository();
        const spans = await traceRepository.getSpansForExport({
            serviceName,
            fromTime,
            toTime,
            minDurationMs,
            errorOnly: errorOnly || undefined,
            spanNameSearch,
        });

        if (!spans || spans.length === 0) {
            res.status(404).json({ error: 'No spans found matching the given filters.' });
            return;
        }

        // Helper to safely escape a CSV field (handles commas, quotes, newlines)
        const csvField = (val: any): string => {
            if (val === null || val === undefined) return '';
            const str = String(val);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const header = [
            'traceId', 'spanName', 'service', 'startTime', 'durationMs', 'status',
            'db.system', 'db.statement', 'http.method', 'http.url',
            'net.peer.name', 'rpc.service', 'rpc.method',
            'messaging.system', 'messaging.destination'
        ].join(',');

        const rows = spans.map((s: any) => {
            const attrs = s.attributes || {};
            const startTime = new Date(s.startTimeUnixNano / 1_000_000).toISOString();
            const status = s.statusCode === 2 ? 'ERROR' : 'OK';
            return [
                csvField(s.traceId),
                csvField(s.name),
                csvField(s.serviceName),
                csvField(startTime),
                csvField(s.durationMs?.toFixed(2)),
                csvField(status),
                csvField(attrs['db.system']),
                csvField(attrs['db.statement']),
                csvField(attrs['http.method']),
                csvField(attrs['http.url']),
                csvField(attrs['net.peer.name']),
                csvField(attrs['rpc.service']),
                csvField(attrs['rpc.method']),
                csvField(attrs['messaging.system']),
                csvField(attrs['messaging.destination']),
            ].join(',');
        });

        const csv = [header, ...rows].join('\n');

        // Build a descriptive filename from applied filters
        const svcLabel = serviceName ? `_${serviceName}` : '_all-services';
        const durLabel = minDurationMs ? `_gt${minDurationMs}ms` : '';
        const errLabel = errorOnly ? '_errors' : '';
        const dateLabel = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
        const filename = `slow-queries${svcLabel}${durLabel}${errLabel}_${dateLabel}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
    } catch (error) {
        console.error('Failed to export spans:', error);
        res.status(500).json({ error: 'Failed to export spans.' });
    }
});

