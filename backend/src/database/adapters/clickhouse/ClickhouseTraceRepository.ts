import { retentionSeconds } from '../../../utils/RetentionPolicy';
import { ensureClickhouseRetention } from './ensureClickhouseRetention';
import { ITraceRepository, ISpan, IServiceMetrics, ITraceSummary, IServiceDependency } from '../../interfaces/ITraceRepository';
import { clickhouseService } from '../../../services/ClickhouseService';

export class ClickhouseTraceRepository implements ITraceRepository {
    private isInitialized = false;

    async initialize(): Promise<void> {
        if (this.isInitialized) return;
        
        const client = clickhouseService.getClient();
        if (!client) {
            throw new Error('ClickHouse is not configured for retention setup');
        }

        const dbName = clickhouseService.getDatabase();

        const seconds = retentionSeconds('APM');
        try {
            await client.command({
                query: `
                    CREATE TABLE IF NOT EXISTS ${dbName}.apmspans (
                        traceId String,
                        spanId String,
                        parentSpanId String,
                        serviceName String,
                        name String,
                        kind String,
                        startTimeUnixNano UInt64,
                        endTimeUnixNano UInt64,
                        durationMs Float64,
                        statusCode UInt8,
                        attributes String,
                        timestamp DateTime
                    ) ENGINE = MergeTree()
                    ORDER BY (serviceName, timestamp, traceId)
                `
            });
            await ensureClickhouseRetention(client, dbName, 'apmspans', seconds);
            this.isInitialized = true;
            console.log('Clickhouse Trace Repository Initialized');
        } catch (err) {
            console.error('Failed to initialize ClickhouseTraceRepository:', err);
            throw err;
        }
    }

    async insertSpans(spans: ISpan[]): Promise<void> {
        if (!spans || spans.length === 0) return;
        
        const client = clickhouseService.getClient();
        if (!client) return;

        const values = spans.map(span => {
            const timestamp = new Date(span.startTimeUnixNano / 1000000).toISOString().replace('T', ' ').substring(0, 19);
            return {
                traceId: span.traceId,
                spanId: span.spanId,
                parentSpanId: span.parentSpanId || '',
                serviceName: span.serviceName,
                name: span.name,
                kind: span.kind || '',
                startTimeUnixNano: span.startTimeUnixNano,
                endTimeUnixNano: span.endTimeUnixNano,
                durationMs: span.durationMs,
                statusCode: span.statusCode || 0,
                attributes: span.attributes ? JSON.stringify(span.attributes) : '{}',
                timestamp
            };
        });

        const dbName = clickhouseService.getDatabase();

        try {
            await client.insert({
                table: `${dbName}.apmspans`,
                values,
                format: 'JSONEachRow'
            });
        } catch (err) {
            console.error('Failed to insert spans into Clickhouse:', err);
        }
    }

    // --- Analytics Methods ---
    // Query values remain bound parameters, including service names and search text.

    async getServiceMetrics(fromMs: number, toMs: number): Promise<IServiceMetrics[]> {
        const client = clickhouseService.getClient();
        if (!client) return [];

        const from = new Date(fromMs).toISOString().replace('T', ' ').substring(0, 19);
        const to = new Date(toMs).toISOString().replace('T', ' ').substring(0, 19);

        const dbName = clickhouseService.getDatabase();

        try {
            const resultSet = await client.query({
                query: `
                    SELECT 
                        serviceName,
                        count() as requestCount,
                        sum(if(statusCode = 2, 1, 0)) as errorCount,
                        avg(durationMs) as avgDurationMs,
                        quantile(0.95)(durationMs) as p95DurationMs
                    FROM ${dbName}.apmspans
                    WHERE timestamp >= {from: DateTime} AND timestamp <= {to: DateTime}
                    GROUP BY serviceName
                `,
                query_params: { from, to },
                format: 'JSONEachRow'
            });
            const data: any[] = await resultSet.json();
            return data.map(d => ({
                serviceName: d.serviceName,
                requestCount: Number(d.requestCount),
                errorCount: Number(d.errorCount),
                avgDurationMs: Number(d.avgDurationMs),
                p95DurationMs: Number(d.p95DurationMs)
            }));
        } catch (err) {
            console.error('ClickhouseTraceRepository getServiceMetrics error:', err);
            return [];
        }
    }

    async getTraceDetails(traceId: string): Promise<ISpan[]> {
        const client = clickhouseService.getClient();
        if (!client) return [];

        const dbName = clickhouseService.getDatabase();

        try {
            const resultSet = await client.query({
                query: `
                    SELECT * FROM ${dbName}.apmspans
                    WHERE traceId = {traceId: String}
                    ORDER BY startTimeUnixNano ASC
                `,
                query_params: { traceId },
                format: 'JSONEachRow'
            });
            const data: any[] = await resultSet.json();
            return data.map(d => ({
                ...d,
                attributes: JSON.parse(d.attributes || '{}')
            }));
        } catch (err) {
            console.error('ClickhouseTraceRepository getTraceDetails error:', err);
            return [];
        }
    }

    async getServiceDependencies(fromMs: number, toMs: number): Promise<IServiceDependency[]> {
        const rows = await this.queryRows<{ source: string; target: string; callCount: number | string; errorCount: number | string }>(`
            SELECT p.serviceName AS source, c.serviceName AS target,
                   count() AS callCount, countIf(c.statusCode = 2) AS errorCount
            FROM ${clickhouseService.getDatabase()}.apmspans AS c
            INNER JOIN ${clickhouseService.getDatabase()}.apmspans AS p
                ON c.parentSpanId = p.spanId AND c.traceId = p.traceId
            WHERE c.serviceName != p.serviceName
                AND c.timestamp >= {from: DateTime} AND c.timestamp <= {to: DateTime}
            GROUP BY p.serviceName, c.serviceName`, {
            from: this.timestamp(new Date(fromMs)), to: this.timestamp(new Date(toMs)),
        });
        return rows.map(row => ({ ...row, callCount: Number(row.callCount), errorCount: Number(row.errorCount) }));
    }

    async getRecentTraceIdForService(serviceName: string): Promise<string | null> {
        const client = clickhouseService.getClient();
        if (!client) return null;

        const dbName = clickhouseService.getDatabase();

        try {
            const resultSet = await client.query({
                query: `
                    SELECT traceId FROM ${dbName}.apmspans
                    WHERE serviceName = {serviceName: String}
                    ORDER BY timestamp DESC
                    LIMIT 1
                `,
                query_params: { serviceName },
                format: 'JSONEachRow'
            });
            const data: any[] = await resultSet.json();
            return data.length > 0 ? data[0].traceId : null;
        } catch (err) {
            console.error('ClickhouseTraceRepository getRecentTraceIdForService error:', err);
            return null;
        }
    }

    async getRecentTraces(serviceName: string, limit: number = 50, minDurationMs?: number, errorOnly?: boolean, attributeSearch?: string, fromMs?: number, toMs?: number): Promise<ITraceSummary[]> {
        const client = clickhouseService.getClient();
        if (!client) return [];

        let whereClause = `serviceName = {serviceName: String}`;
        const queryParams: any = { serviceName };

        if (minDurationMs) {
            whereClause += ` AND durationMs >= {minDuration: Float64}`;
            queryParams.minDuration = minDurationMs;
        }
        if (errorOnly) {
            whereClause += ` AND statusCode = 2`;
        }
        if (attributeSearch) {
            whereClause += ` AND name ILIKE {search: String}`;
            queryParams.search = `%${attributeSearch}%`;
        }
        if (fromMs) {
            whereClause += ` AND timestamp >= {from: DateTime}`;
            queryParams.from = new Date(fromMs).toISOString().replace('T', ' ').substring(0, 19);
        }
        if (toMs) {
            whereClause += ` AND timestamp <= {to: DateTime}`;
            queryParams.to = new Date(toMs).toISOString().replace('T', ' ').substring(0, 19);
        }

        const dbName = clickhouseService.getDatabase();

        try {
            const resultSet = await client.query({
                query: `
                    SELECT traceId, argMax(name, timestamp) as name, argMax(startTimeUnixNano, timestamp) as startTimeUnixNano, argMax(durationMs, timestamp) as durationMs, argMax(statusCode, timestamp) as statusCode
                    FROM ${dbName}.apmspans
                    WHERE ${whereClause}
                    GROUP BY traceId
                    ORDER BY startTimeUnixNano DESC
                    LIMIT ${limit}
                `,
                query_params: queryParams,
                format: 'JSONEachRow'
            });
            const data: any[] = await resultSet.json();
            return data.map(d => ({
                traceId: d.traceId,
                name: d.name,
                startTimeUnixNano: Number(d.startTimeUnixNano),
                durationMs: Number(d.durationMs),
                statusCode: Number(d.statusCode)
            }));
        } catch (err) {
            console.error('ClickhouseTraceRepository getRecentTraces error:', err);
            return [];
        }
    }

    async getRecentTraceIdForEdge(sourceName: string, targetName: string): Promise<string | null> {
        const rows = await this.queryRows<{ traceId: string }>(`
            SELECT c.traceId AS traceId
            FROM ${clickhouseService.getDatabase()}.apmspans AS c
            INNER JOIN ${clickhouseService.getDatabase()}.apmspans AS p
                ON c.parentSpanId = p.spanId AND c.traceId = p.traceId
            WHERE p.serviceName = {sourceName: String} AND c.serviceName = {targetName: String}
                AND c.timestamp >= {from: DateTime}
            ORDER BY c.timestamp DESC LIMIT 1`, {
            sourceName, targetName, from: this.timestamp(new Date(Date.now() - 12 * 60 * 60 * 1000)),
        });
        return rows[0]?.traceId ?? null;
    }

    async getSpansForExport(options: Parameters<ITraceRepository['getSpansForExport']>[0]): Promise<ISpan[]> {
        const filters: string[] = [];
        const params: Record<string, string | number> = {};
        const add = (condition: boolean, clause: string, name: string, value: string | number) => {
            if (condition) { filters.push(clause); params[name] = value; }
        };
        add(!!options.serviceName, 'serviceName = {serviceName: String}', 'serviceName', options.serviceName ?? '');
        add(!!options.fromTime, 'timestamp >= {from: DateTime}', 'from', options.fromTime ? this.timestamp(options.fromTime) : '');
        add(!!options.toTime, 'timestamp <= {to: DateTime}', 'to', options.toTime ? this.timestamp(options.toTime) : '');
        add((options.minDurationMs ?? 0) > 0, 'durationMs >= {minDuration: Float64}', 'minDuration', options.minDurationMs ?? 0);
        add(!!options.spanNameSearch, 'name LIKE {search: String}', 'search', `%${options.spanNameSearch ?? ''}%`);
        if (options.errorOnly) filters.push('statusCode = 2');
        const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
        const rows = await this.queryRows<Omit<ISpan, 'attributes'> & { attributes: string }>(`
            SELECT * FROM ${clickhouseService.getDatabase()}.apmspans ${where}
            ORDER BY durationMs DESC LIMIT 2000`, params);
        return rows.map(row => ({ ...row, attributes: JSON.parse(row.attributes || '{}') }));
    }

    private timestamp(date: Date): string {
        return date.toISOString().replace('T', ' ').substring(0, 19);
    }

    private async queryRows<T>(query: string, query_params: Record<string, string | number>): Promise<T[]> {
        const client = clickhouseService.getClient();
        if (!client) return [];
        try {
            const result = await client.query({ query, query_params, format: 'JSONEachRow' });
            return await result.json<T>();
        } catch (error) {
            console.error('ClickHouse trace query failed:', error);
            return [];
        }
    }
}
