import type { Request, Response } from 'express';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { canAccessKubernetesNamespace } from '../middleware/auth';
import { RbacRoleService } from '../services/RbacRoleService';
import { normalizedTraceId } from '../utils/logCorrelation';
import type { ISpan } from '../database/interfaces/ITraceRepository';

export function traceLogWindow(spans: ISpan[], now = Date.now()) {
    let from = Infinity, to = -Infinity;
    for (const span of spans) {
        const start = Number(span.startTimeUnixNano) / 1e6, end = Number(span.endTimeUnixNano) / 1e6;
        if (Number.isFinite(start) && start > 0) from = Math.min(from, start);
        if (Number.isFinite(end) && end > 0) to = Math.max(to, end);
    }
    if (!Number.isFinite(from) || !Number.isFinite(to)) return { from: new Date(now - 7 * 86400000), to: new Date(now) };
    if (to < from || to - from > 86400000) throw new Error('Trace window exceeds the supported 24-hour range.');
    return { from: new Date(Math.floor(from) - 60000), to: new Date(Math.ceil(to) + 60000) };
}
async function permittedLogSources(req: Request, names: string[]): Promise<string[]> {
    const canReadKubernetes = await RbacRoleService.hasPermission(req.user || {}, 'kubernetes.read');
    const visible = await Promise.all(names.map(async name => {
        if (!name.startsWith('k8s:')) return name;
        if (!canReadKubernetes || !await canAccessKubernetesNamespace(req.user, name.split(':')[1])) return null;
        return name;
    }));
    return visible.filter((name): name is string => name !== null);
}

export async function traceLogs(req: Request, res: Response) {
    const traceId = normalizedTraceId(req.params.traceId);
    if (!traceId) return res.status(400).json({ message: 'Enter a valid trace ID.' });
    if (!DatabaseFactory.isLogStorageSupported()) return res.status(409).json({ message: 'Retained log search requires MongoDB or ClickHouse. Live streams alone are not retained logs.' });
    try {
        const repo = await DatabaseFactory.getLogRepository();
        const names = await repo.getServices();
        let serviceNames = await permittedLogSources(req, names);
        if (req.query.serviceName) {
            if (!serviceNames.includes(String(req.query.serviceName))) return res.status(403).json({ message: 'Access denied to this retained log source.' });
            serviceNames = [String(req.query.serviceName)];
        }
        const spans = DatabaseFactory.isApmSupported() ? await (await DatabaseFactory.getTraceRepository()).getTraceDetails(traceId) : [];
        let window;
        try { window = traceLogWindow(spans); } catch { return res.status(400).json({ message: 'Trace time range is invalid or too large.' }); }
        const logs = serviceNames.length ? await repo.queryLogs('', { ...window, serviceNames, traceId, limit: 500 }) : [];
        res.json({ traceId, fromMs: window.from.getTime(), toMs: window.to.getTime(), traceFound: spans.length > 0, sourceCount: serviceNames.length, logs });
    } catch { res.status(503).json({ message: 'Retained trace logs are unavailable. Please retry.' }); }
}
