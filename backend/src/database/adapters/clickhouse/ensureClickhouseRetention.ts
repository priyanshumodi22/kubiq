import type { ClickHouseClient } from '@clickhouse/client';

/** Reconcile TTL on existing tables as well as fresh installations. */
export async function ensureClickhouseRetention(client: ClickHouseClient, database: string,
    table: 'apmspans' | 'app_logs', seconds: number): Promise<void> {
    // Identifiers come from deployment configuration, never request parameters.
    const identifier = database.replaceAll('`', '``');
    const query = `SELECT create_table_query FROM system.tables WHERE database = {database:String} AND name = {table:String}`;
    const readDefinition = async () => {
        const result = await client.query({ query, query_params: { database, table }, format: 'JSONEachRow' });
        const rows = await result.json<{ create_table_query: string }>();
        return rows[0]?.create_table_query || '';
    };
    const expected = `TTL timestamp + toIntervalSecond(${seconds})`;
    if (!(await readDefinition()).includes(expected)) {
        await client.command({ query: `ALTER TABLE \`${identifier}\`.${table} MODIFY TTL timestamp + toIntervalSecond(${seconds}) DELETE` });
    }
    if (!(await readDefinition()).includes(expected)) {
        throw new Error(`Retention verification failed for ClickHouse ${table}`);
    }
}
