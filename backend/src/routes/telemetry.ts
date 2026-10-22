import { Router, Request, Response } from 'express';
import { IngestionBufferService } from '../services/IngestionBufferService';
import { requireIngestionAuth } from '../middleware/ingestionAuth';

export const telemetryRouter = Router();
telemetryRouter.use(requireIngestionAuth);

const MAX_LOG_BATCH = (() => {
    const value = Number.parseInt(process.env.KUBIQ_INGESTION_MAX_LOG_BATCH || '', 10);
    return Number.isSafeInteger(value) && value > 0 ? value : 500;
})();

function logTimestamp(entry: { date?: number; timestamp?: string }): Date {
    if (entry.date) return new Date(entry.date * 1000);
    return entry.timestamp ? new Date(entry.timestamp) : new Date();
}

/**
 * POST /api/telemetry/logs
 * Custom ingestion endpoint designed for the kubiq-agent (FluentBit).
 * Expects an array of log objects.
 */
telemetryRouter.post('/logs', (req: Request, res: Response) => {
    try {
        const payload = req.body;
        
        // FluentBit standard HTTP output sends an array of log records
        // Format can be configured, but usually: [ { date: ..., log: ... }, ... ]
        // We will adapt standard format if needed, but for now expect standard objects.
        if (!Array.isArray(payload)) {
            res.status(400).json({ error: 'Payload must be a JSON array' });
            return;
        }
        if (payload.length > MAX_LOG_BATCH) {
            res.status(413).json({ error: 'TELEMETRY_BATCH_TOO_LARGE', message: `A maximum of ${MAX_LOG_BATCH} logs is accepted per request.` });
            return;
        }

        // We assume the payload contains objects with structure:
        // { serviceName, sourceName, level, message, timestamp }
        // The FluentBit wrapper (kubiq-agent) will be configured to format it like this.
        
        const logs = payload.map((entry: any) => {
            // Smart extraction from FluentBit Kubernetes filter
            const k8s = entry.kubernetes || {};
            const labels = k8s.labels || {};
            
            const namespace = k8s.namespace_name || 'unknown';
            const podName = k8s.pod_name;
            const deployName = labels['kubiq.service'] || labels['app'] || (podName ? podName.split('-')[0] : k8s.container_name || 'unknown');
            const serviceName = entry.serviceName || (k8s.namespace_name ? `k8s:${namespace}:${deployName}` : deployName);
            const sourceName = entry.sourceName || podName || 'unknown-pod';
            
            return {
                serviceName,
                sourceName,
                level: entry.level || 'INFO',
                message: entry.message || entry.log || JSON.stringify(entry),
                timestamp: logTimestamp(entry)
            };
        });

        if (logs.length > 0) {
            if (!IngestionBufferService.getInstance().addLogs(logs)) {
                res.status(429).json({ error: 'TELEMETRY_BUFFER_FULL', message: 'Telemetry ingestion is temporarily at capacity.' });
                return;
            }
        }

        res.status(202).end();
    } catch (error) {
        console.error('Failed to ingest telemetry logs:', error);
        res.status(500).json({ error: 'Internal Server Error processing logs' });
    }
});
