import * as runtime from 'kubiq-apm/runtime';
export interface DatabaseSpan { setAttributes(attributes: Record<string, string | number>): void; end(error?: unknown): void }
interface DatabaseRuntime {
    beginDependency?: (name: string, attributes: Record<string, string | number>) => DatabaseSpan | null;
    databaseQueryDetails?: (value: unknown) => string;
}
const databaseRuntime = runtime as unknown as DatabaseRuntime;
export function beginDatabaseSpan(name: string, attributes: Record<string, string | number>): DatabaseSpan | null {
    return databaseRuntime.beginDependency?.(name, attributes) || null;
}
export function queryDetails(value: unknown): string {
    return databaseRuntime.databaseQueryDetails?.(value) || '[QUERY DETAILS UNAVAILABLE]';
}
export function databaseDetailsEnabled(): boolean {
    return process.env.KUBIQ_TRACING_ENABLED === 'true' && process.env.KUBIQ_TRACING_QUERY_DETAILS === 'true';
}
