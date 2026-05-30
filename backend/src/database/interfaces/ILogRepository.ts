export interface ILogRepository {
    initialize(): Promise<void>;
    insertLogs(logs: any[]): Promise<void>;
    queryLogs(serviceName: string, opts: {
        sourceName?: string;
        from: Date;
        to: Date;
        level?: string;
        search?: string;
        limit?: number;
    }): Promise<any[]>;
    deleteLogsBefore(cutoff: Date): Promise<number>;
    getLogSourcesForService(serviceName: string): Promise<string[]>;
}
