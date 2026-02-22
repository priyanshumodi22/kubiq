import mysql, { Pool, RowDataPacket } from 'mysql2/promise';
import { ITraceRepository, ISpan, IServiceMetrics } from '../../interfaces/ITraceRepository';

export class MysqlTraceRepository implements ITraceRepository {
    private pool: Pool;
    private isInitialized = false;

    constructor() {
        this.pool = mysql.createPool({
            host: process.env.DB_HOST || ((process.env.NODE_ENV === 'production' && !process.env.DB_HOST) ? 'host.docker.internal' : 'localhost'),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'root',
            database: process.env.DB_NAME || 'kubiq_db',
            port: parseInt(process.env.DB_PORT || '3306', 10),
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            // For fast batch inserts
            multipleStatements: true
        });
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            const connection = await this.pool.getConnection();

            // Auto-create table if missing
            await connection.query(`
        CREATE TABLE IF NOT EXISTS apm_spans (
          span_id VARCHAR(64) PRIMARY KEY,
          trace_id VARCHAR(64) NOT NULL,
          parent_span_id VARCHAR(64) DEFAULT NULL,
          service_name VARCHAR(128) NOT NULL,
          span_name VARCHAR(256) NOT NULL,
          span_kind VARCHAR(32),
          start_time_unix_nano BIGINT NOT NULL,
          end_time_unix_nano BIGINT NOT NULL,
          duration_ms DOUBLE NOT NULL,
          status_code INT DEFAULT 0,
          attributes JSON,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_trace_id (trace_id),
          INDEX idx_service_name (service_name),
          INDEX idx_timestamp (timestamp)
        )
      `);

            connection.release();
            this.isInitialized = true;
            console.log('MySQL Trace Repository Initialized');
        } catch (error) {
            console.error('Failed to initialize MySQL trace repository:', error);
            throw error;
        }
    }

    async insertSpans(spans: ISpan[]): Promise<void> {
        if (!spans || spans.length === 0) return;

        // Use INSERT IGNORE to skip E11000 equivalent duplicates
        const query = `
      INSERT IGNORE INTO apm_spans 
      (span_id, trace_id, parent_span_id, service_name, span_name, span_kind, start_time_unix_nano, end_time_unix_nano, duration_ms, status_code, attributes, timestamp)
      VALUES ?
    `;

        // Map the spans into an array of arrays for the bulk insert syntax
        const values = spans.map(span => [
            span.spanId,
            span.traceId,
            span.parentSpanId || null,
            span.serviceName,
            span.name,
            span.kind || 'UNKNOWN',
            span.startTimeUnixNano,
            span.endTimeUnixNano,
            span.durationMs,
            span.statusCode || 0,
            JSON.stringify(span.attributes || {}),
            new Date(span.startTimeUnixNano / 1000000) // Convert nano to Date for datetime column
        ]);

        try {
            await this.pool.query(query, [values]);
        } catch (error) {
            console.error('Failed to batch insert spans into MySQL:', error);
            throw error;
        }
    }

    async getServiceMetrics(timeRangeMs: number): Promise<IServiceMetrics[]> {
        const since = new Date(Date.now() - timeRangeMs);

        // In MySQL 8.x we could use PERCENTILE_CONT for p95, but we fallback
        // to a simpler approx or do calculation in JS for vast compat. 
        // Usually for heavy TimeSeries, you use ClickHouse.
        // For now we get AVG and Count, and approximate p95 or skip it.

        const query = `
      SELECT 
        service_name as serviceName,
        COUNT(*) as requestCount,
        SUM(CASE WHEN status_code = 2 THEN 1 ELSE 0 END) as errorCount,
        AVG(duration_ms) as avgDurationMs
      FROM apm_spans
      WHERE timestamp >= ?
      GROUP BY service_name
    `;

        const [rows] = await this.pool.query<RowDataPacket[]>(query, [since]);

        return rows.map(row => ({
            serviceName: row.serviceName,
            requestCount: Number(row.requestCount),
            errorCount: Number(row.errorCount),
            avgDurationMs: Number(row.avgDurationMs) || 0,
            // p95 is complex in vanilla MySQL without GROUP_CONCAT limits. Defaulting to avg for now.
            p95DurationMs: Number(row.avgDurationMs) || 0
        }));
    }

    async getTraceDetails(traceId: string): Promise<ISpan[]> {
        const query = `
      SELECT * FROM apm_spans 
      WHERE trace_id = ? 
      ORDER BY start_time_unix_nano ASC
    `;

        const [rows] = await this.pool.query<RowDataPacket[]>(query, [traceId]);

        return rows.map(row => ({
            traceId: row.trace_id,
            spanId: row.span_id,
            parentSpanId: row.parent_span_id,
            serviceName: row.service_name,
            name: row.span_name,
            kind: row.span_kind,
            startTimeUnixNano: row.start_time_unix_nano,
            endTimeUnixNano: row.end_time_unix_nano,
            durationMs: row.duration_ms,
            statusCode: row.status_code,
            attributes: typeof row.attributes === 'string' ? JSON.parse(row.attributes) : row.attributes
        }));
    }

    async getRecentTraceIdForService(serviceName: string): Promise<string | null> {
        const query = `
      SELECT trace_id FROM apm_spans 
      WHERE service_name = ? 
      ORDER BY timestamp DESC 
      LIMIT 1
    `;

        const [rows] = await this.pool.query<RowDataPacket[]>(query, [serviceName]);
        return rows.length > 0 ? rows[0].trace_id : null;
    }
}
