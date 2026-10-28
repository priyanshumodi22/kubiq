export interface LogQueryOptions {
    sourceName?: string;
    from: Date;
    to: Date;
    level?: string;
    search?: string;
    limit?: number;
    /** Internal authorized scope, computed by the server, never copied from request input. */
    serviceNames?: string[];
    traceId?: string;
}
export interface ILogRepository {
    initialize(): Promise<void>;
    insertLogs(logs: any[]): Promise<void>;
    queryLogs(serviceName: string, opts: LogQueryOptions): Promise<any[]>;
    deleteLogsBefore(cutoff: Date): Promise<number>;
    getLogSourcesForService(serviceName: string): Promise<string[]>;
    getServices(): Promise<string[]>;
}
