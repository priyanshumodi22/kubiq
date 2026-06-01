import { ILogRepository } from '../../interfaces/ILogRepository';
import { clickhouseService } from '../../../services/ClickhouseService';

export class ClickhouseLogRepository implements ILogRepository {
    private isInitialized = false;

    async initialize(): Promise<void> {
        if (this.isInitialized) return;
        
        const client = clickhouseService.getClient();
        if (!client) {
            console.error('ClickhouseLogRepository: client is null');
            return;
        }

        const dbName = clickhouseService.getDatabase();

        try {
            await client.command({
                query: `
                    CREATE TABLE IF NOT EXISTS ${dbName}.app_logs (
                        serviceName String,
                        sourceName String,
                        level String,
                        message String,
                        timestamp DateTime
                    ) ENGINE = MergeTree()
                    ORDER BY (serviceName, sourceName, timestamp)
                `
            });
            this.isInitialized = true;
            console.log('Clickhouse Log Repository Initialized');
        } catch (err) {
            console.error('Failed to initialize ClickhouseLogRepository:', err);
        }
    }

    async insertLogs(logs: any[]): Promise<void> {
        if (!logs || logs.length === 0) return;
        
        const client = clickhouseService.getClient();
        if (!client) return;

        const dbName = clickhouseService.getDatabase();

        const values = logs.map(log => {
            const timestamp = (log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp))
                .toISOString().replace('T', ' ').substring(0, 19);
            
            return {
                serviceName: log.serviceName || 'unknown',
                sourceName: log.sourceName || 'unknown',
                level: log.level || 'INFO',
                message: log.message || '',
                timestamp
            };
        });

        try {
            await client.insert({
                table: `${dbName}.app_logs`,
                values,
                format: 'JSONEachRow'
            });
        } catch (err) {
            console.error('Failed to insert logs into Clickhouse:', err);
        }
    }

    async queryLogs(serviceName: string, opts: {
        sourceName?: string;
        from: Date;
        to: Date;
        level?: string;
        search?: string;
        limit?: number;
    }): Promise<any[]> {
        const client = clickhouseService.getClient();
        if (!client) return [];

        const dbName = clickhouseService.getDatabase();
        let whereClause = `serviceName = {serviceName: String} AND timestamp >= {from: DateTime} AND timestamp <= {to: DateTime}`;
        const queryParams: any = { 
            serviceName,
            from: opts.from.toISOString().replace('T', ' ').substring(0, 19),
            to: opts.to.toISOString().replace('T', ' ').substring(0, 19)
        };

        if (opts.sourceName) {
            whereClause += ` AND sourceName = {sourceName: String}`;
            queryParams.sourceName = opts.sourceName;
        }

        if (opts.level && opts.level.toUpperCase() !== 'ALL') {
            whereClause += ` AND level = {level: String}`;
            queryParams.level = opts.level.toUpperCase();
        }

        if (opts.search) {
            whereClause += ` AND message ILIKE {search: String}`;
            queryParams.search = `%${opts.search}%`;
        }

        const limit = opts.limit || 500;

        try {
            const resultSet = await client.query({
                query: `
                    SELECT * FROM ${dbName}.app_logs
                    WHERE ${whereClause}
                    ORDER BY timestamp DESC
                    LIMIT ${limit}
                `,
                query_params: queryParams,
                format: 'JSONEachRow'
            });
            return await resultSet.json();
        } catch (err) {
            console.error('ClickhouseLogRepository queryLogs error:', err);
            return [];
        }
    }

    async deleteLogsBefore(cutoff: Date): Promise<number> {
        const client = clickhouseService.getClient();
        if (!client) return 0;
        const dbName = clickhouseService.getDatabase();
        
        try {
            const cutoffStr = cutoff.toISOString().replace('T', ' ').substring(0, 19);
            await client.command({
                query: `ALTER TABLE ${dbName}.app_logs DELETE WHERE timestamp < '${cutoffStr}'`
            });
            return 1; 
        } catch (err) {
            console.error('ClickhouseLogRepository deleteLogsBefore error:', err);
            return 0;
        }
    }

    async getLogSourcesForService(serviceName: string): Promise<string[]> {
        const client = clickhouseService.getClient();
        if (!client) return [];
        const dbName = clickhouseService.getDatabase();

        try {
            const resultSet = await client.query({
                query: `
                    SELECT DISTINCT sourceName 
                    FROM ${dbName}.app_logs
                    WHERE serviceName = {serviceName: String}
                `,
                query_params: { serviceName },
                format: 'JSONEachRow'
            });
            const data: any[] = await resultSet.json();
            return data.map((d: any) => d.sourceName);
        } catch (err) {
            console.error('ClickhouseLogRepository getLogSourcesForService error:', err);
            return [];
        }
    }
    async getServices(): Promise<string[]> {
        const client = clickhouseService.getClient();
        if (!client) return [];
        const dbName = clickhouseService.getDatabase();

        try {
            const resultSet = await client.query({
                query: `
                    SELECT DISTINCT serviceName 
                    FROM ${dbName}.app_logs
                `,
                format: 'JSONEachRow'
            });
            const data: any[] = await resultSet.json();
            return data.map((d: any) => d.serviceName);
        } catch (err) {
            console.error('ClickhouseLogRepository getServices error:', err);
            return [];
        }
    }
}
