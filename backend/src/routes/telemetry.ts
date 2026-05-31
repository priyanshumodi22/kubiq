import { Router, Request, Response } from 'express';
import { IngestionBufferService } from '../services/IngestionBufferService';

export const telemetryRouter = Router();

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

        // We assume the payload contains objects with structure:
        // { serviceName, sourceName, level, message, timestamp }
        // The FluentBit wrapper (kubiq-agent) will be configured to format it like this.
        
        const logs = payload.map((entry: any) => {
            // Smart extraction from FluentBit Kubernetes filter
            const k8s = entry.kubernetes || {};
            const labels = k8s.labels || {};
            
            // Prefer kubiq.service label, then app label, then container name
            const serviceName = entry.serviceName || labels['kubiq.service'] || labels['app'] || k8s.container_name || 'unknown-service';
            const sourceName = entry.sourceName || k8s.pod_name || 'unknown-pod';
            
            return {
                serviceName,
                sourceName,
                level: entry.level || 'INFO',
                message: entry.message || entry.log || JSON.stringify(entry),
                timestamp: entry.date ? new Date(entry.date * 1000) : (entry.timestamp ? new Date(entry.timestamp) : new Date())
            };
        });

        if (logs.length > 0) {
            IngestionBufferService.getInstance().addLogs(logs);
        }

        res.status(202).end();
    } catch (error) {
        console.error('Failed to ingest telemetry logs:', error);
        res.status(500).json({ error: 'Internal Server Error processing logs' });
    }
});
