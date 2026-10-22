import { Router, Request, Response } from 'express';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { ISpan } from '../database/interfaces/ITraceRepository';
import { IngestionBufferService } from '../services/IngestionBufferService';
import { requirePermission } from '../middleware/auth';
import { requireIngestionAuth } from '../middleware/ingestionAuth';
import { matchesIgnoredRoute, OtlpPayloadError, parseOtlpPayload } from '../utils/otlpPayload';

export const apmIngestRouter = Router();
export const apmAnalyticsRouter = Router();
apmAnalyticsRouter.use(requirePermission('apm.read'));
// This router shares the /api/apm mount with analytics. Restrict ingestion
// credentials to the OTLP/Zipkin namespace so dashboard reads keep JWT auth.
apmIngestRouter.use('/v1', requireIngestionAuth);

const MAX_SPANS_PER_REQUEST = (() => {
    const value = Number.parseInt(process.env.KUBIQ_INGESTION_MAX_SPANS_PER_REQUEST || '', 10);
    return Number.isSafeInteger(value) && value > 0 ? value : 1_000;
})();

// Ingest middleware: bypass trace processing if APM is unsupported
apmIngestRouter.use((req, res, next) => {
    if (!DatabaseFactory.isApmSupported()) {
        res.status(202).json({ message: 'APM ingestion disabled (DB_TYPE is json)' });
        return;
    }
    next();
});

// Analytics middleware: block all routes except /status if APM is unsupported
apmAnalyticsRouter.use((req, res, next) => {
    if (req.path === '/status') {
        return next();
    }
    if (!DatabaseFactory.isApmSupported()) {
        res.status(503).json({
            error: 'APM_NOT_SUPPORTED',
            message: 'APM & Traces require DB_TYPE=mysql or DB_TYPE=mongodb.'
        });
        return;
    }
    next();
});

/**
 * GET /api/apm/status
 * Lightweight check the frontend calls on mount to know if APM is available.
 * Returns { supported: true } for mysql/mongodb, { supported: false, reason, dbType } for json.
 */
apmAnalyticsRouter.get('/status', (req: Request, res: Response) => {
    const supported = DatabaseFactory.isApmSupported();
    const dbType = process.env.DB_TYPE || 'json';
    if (supported) {
        res.json({ supported: true, dbType });
    } else {
        res.status(503).json({
            supported: false,
            dbType,
            reason: 'APM & Traces require a persistent database backend.',
            fix: 'Set DB_TYPE=mysql or DB_TYPE=mongodb in your kubiq environment and restart.',
        });
    }
});

let cachedApmConfig: { ignoredRoutes: string[] } | null = null;
let lastApmConfigFetch = 0;

async function getApmConfigCached(): Promise<{ ignoredRoutes: string[] }> {
    const now = Date.now();
    if (!cachedApmConfig || now - lastApmConfigFetch > 60000) { // 1 min cache
        const systemRepo = await DatabaseFactory.getSystemRepository();
        cachedApmConfig = await systemRepo.getApmConfig();
        lastApmConfigFetch = now;
    }
    return cachedApmConfig;
}


/**
 * POST /v1/traces
 * The standard OTLP HTTP JSON ingestion endpoint.
 */
apmIngestRouter.post('/v1/traces', async (req: Request, res: Response) => {
    if (!req.is('application/json')) {
        res.status(415).json({ error: 'APM_UNSUPPORTED_ENCODING', message: 'Use OTLP HTTP JSON, or a Collector configured with JSON encoding.' });
        return;
    }
    try {
        const rawPayload = req.body;

        // 1. Flatten the massive OTLP JSON into flat span records
        const spans = parseOtlpPayload(rawPayload, MAX_SPANS_PER_REQUEST);

        if (spans.length === 0) {
            res.status(202).json({ message: 'No spans found in payload' });
            return;
        }

        // 2. Filter out ignored routes to save DB space
        const config = await getApmConfigCached();
        const ignoredPaths = config.ignoredRoutes;
        
        const traceIdsToDrop = new Set(
            spans
              .filter(span => matchesIgnoredRoute(span, ignoredPaths))
              .map(span => span.traceId)
        );
        
        const cleanSpans = spans.filter(span => !traceIdsToDrop.has(span.traceId));

        if (cleanSpans.length === 0) {
            res.status(202).json({ message: 'All spans ignored' });
            return;
        }

        // 3. Insert into the high-throughput buffer instead of directly writing to the DB
        if (!IngestionBufferService.getInstance().addSpans(cleanSpans)) {
            res.status(429).json({ error: 'APM_BUFFER_FULL', message: 'APM ingestion is temporarily at capacity.' });
            return;
        }

        // 3. Return 202 Accepted (standard for OTLP receivers)
        res.status(202).end();
    } catch (error) {
        if (error instanceof OtlpPayloadError) {
            res.status(error.status).json({ error: error.status === 413 ? 'APM_BATCH_TOO_LARGE' : 'APM_INVALID_PAYLOAD', message: error.message });
            return;
        }
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
        if (spans.length > MAX_SPANS_PER_REQUEST) {
            res.status(413).json({ error: 'APM_BATCH_TOO_LARGE', message: `A maximum of ${MAX_SPANS_PER_REQUEST} spans is accepted per request.` });
            return;
        }

        const config = await getApmConfigCached();
        const ignoredPaths = config.ignoredRoutes;
        
        const traceIdsToDrop = new Set(
            spans
              .filter(span => span.parentSpanId === null && matchesIgnoredRoute(span, ignoredPaths))
              .map(span => span.traceId)
        );
        
        const cleanSpans = spans.filter(span => !traceIdsToDrop.has(span.traceId));

        if (cleanSpans.length === 0) {
            res.status(202).json({ message: 'All spans ignored' });
            return;
        }

        // Push to high-throughput buffer
        if (!IngestionBufferService.getInstance().addSpans(cleanSpans)) {
            res.status(429).json({ error: 'APM_BUFFER_FULL', message: 'APM ingestion is temporarily at capacity.' });
            return;
        }

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
        const timeRangeMs = Number.parseInt(timeRangeParam as string) || 60 * 60 * 1000; // Default 1 hour

        // Support exact boundaries (fromMs / toMs)
        const fromMs = req.query.fromMs ? Number.parseInt(req.query.fromMs as string, 10) : (Date.now() - timeRangeMs);
        const toMs = req.query.toMs ? Number.parseInt(req.query.toMs as string, 10) : Date.now();

        const traceRepository = await DatabaseFactory.getTraceRepository();
        const metrics = await traceRepository.getServiceMetrics(fromMs, toMs);

        // Add RPM (Requests Per Minute) calculation
        const timeRangeMinutes = (toMs - fromMs) / 60000;
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
        const limit = limitParam ? Number.parseInt(limitParam as string, 10) : 50;

        const minDurationMs = req.query.minDuration ? Number.parseInt(req.query.minDuration as string, 10) : undefined;
        const errorOnly = req.query.errorOnly === 'true';
        const attributeSearch = req.query.search ? (req.query.search as string) : undefined;
        
        const fromMs = req.query.fromMs ? Number.parseInt(req.query.fromMs as string, 10) : undefined;
        const toMs = req.query.toMs ? Number.parseInt(req.query.toMs as string, 10) : undefined;

        const traceRepository = await DatabaseFactory.getTraceRepository();
        const traces = await traceRepository.getRecentTraces(serviceName, limit, minDurationMs, errorOnly, attributeSearch, fromMs, toMs);

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
        const traceId = traceIdParam;
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
        const timeRangeMs = Number.parseInt(req.query.timeRange as string) || 60 * 60 * 1000;
        
        const fromMs = req.query.fromMs ? Number.parseInt(req.query.fromMs as string, 10) : (Date.now() - timeRangeMs);
        const toMs = req.query.toMs ? Number.parseInt(req.query.toMs as string, 10) : Date.now();

        const traceRepository = await DatabaseFactory.getTraceRepository();

        const dependencies = await traceRepository.getServiceDependencies(fromMs, toMs);
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
apmAnalyticsRouter.get('/export', requirePermission('apm.export'), async (req: Request, res: Response) => {
    try {
        const fromParam = req.query.from as string | undefined;
        const toParam = req.query.to as string | undefined;
        const serviceName = req.query.service as string | undefined;
        const minDurationMs = req.query.minDuration ? Number.parseInt(req.query.minDuration as string, 10) : undefined;
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
                return `"${str.replaceAll(/"/g, '""')}"`;
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
        const dateLabel = new Date().toISOString().slice(0, 19).replaceAll(/[:.]/g, '-');
        const filename = `slow-queries${svcLabel}${durLabel}${errLabel}_${dateLabel}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
    } catch (error) {
        console.error('Failed to export spans:', error);
        res.status(500).json({ error: 'Failed to export spans.' });
    }
});

