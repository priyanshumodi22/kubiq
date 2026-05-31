import { ITraceRepository, ISpan, IServiceMetrics, ITraceSummary, IServiceDependency } from '../../interfaces/ITraceRepository';
import { clickhouseService } from '../../../services/ClickhouseService';

export class ClickhouseTraceRepository implements ITraceRepository {
    private isInitialized = false;

    async initialize(): Promise<void> {
        if (this.isInitialized) return;
        
        const client = clickhouseService.getClient();
        if (!client) {
            console.error('ClickhouseTraceRepository: client is null');
            return;
        }

        const dbName = clickhouseService.getDatabase();

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
            this.isInitialized = true;
            console.log('Clickhouse Trace Repository Initialized');
        } catch (err) {
            console.error('Failed to initialize ClickhouseTraceRepository:', err);
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
    // For Phase 3 ingestion focus, some of these may return empty or mock until the full query builder is ported.

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
        // Advanced self-join query omitted for brevity during ingestion phase.
        return [];
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
        return null;
    }

    async getSpansForExport(options: any): Promise<any[]> {
        return [];
    }
}
