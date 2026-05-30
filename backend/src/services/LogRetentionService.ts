import { DatabaseFactory } from '../database/DatabaseFactory';

export class LogRetentionService {
    private static instance: LogRetentionService;
    private logBuffer: any[] = [];
    private flushInterval: NodeJS.Timeout;
    private cleanupInterval: NodeJS.Timeout;

    private constructor() {
        // flush logs every 3 seconds
        this.flushInterval = setInterval(() => this.flushLogs(), 3000);
        // cleanup every 12 hours
        this.cleanupInterval = setInterval(() => this.cleanupLogs(), 12 * 60 * 60 * 1000);
        // Do an initial cleanup on startup
        setTimeout(() => this.cleanupLogs(), 5000);
    }

    public static getInstance(): LogRetentionService {
        if (!LogRetentionService.instance) {
            LogRetentionService.instance = new LogRetentionService();
        }
        return LogRetentionService.instance;
    }

    public ingest(serviceName: string, sourceName: string, lines: string[]) {
        const dbType = process.env.DB_TYPE?.toLowerCase() || 'json';
        if (dbType !== 'mongo' && dbType !== 'mongodb') {
            return; // Log retention is only supported in MongoDB
        }

        for (const line of lines) {
            if (!line.trim()) continue;
            
            const level = this.extractLevel(line);
            
            this.logBuffer.push({
                serviceName,
                sourceName,
                timestamp: new Date(),
                level,
                message: line
            });
        }
    }

    private extractLevel(content: string): string {
        const explicitMatch = 
            content.match(/\[(ERROR|WARN|WARNING|INFO|DEBUG|TRACE|FATAL|PANIC|CRITICAL)\]/i) ||
            content.match(/\b(level|severity|lvl)\s*[:=]\s*["']?(error|warn|warning|info|debug|trace|fatal|panic|critical)\b/i) ||
            content.match(/^(?:[\d-T:.Z\s+]+)?\b(ERROR|WARN|WARNING|INFO|DEBUG|TRACE|FATAL|PANIC|CRITICAL)\b/i);

        if (explicitMatch) {
            const found = (explicitMatch[1] || explicitMatch[2]).toLowerCase();
            if (['error', 'fatal', 'panic', 'critical'].includes(found)) return 'ERROR';
            if (['warn', 'warning'].includes(found)) return 'WARN';
            if (['info', 'information'].includes(found)) return 'INFO';
            if (['debug', 'trace'].includes(found)) return 'DEBUG';
        }

        return 'INFO'; // default for retention
    }

    private async flushLogs() {
        if (this.logBuffer.length === 0) return;

        const logsToWrite = [...this.logBuffer];
        this.logBuffer = [];

        try {
            const repo = await DatabaseFactory.getLogRepository();
            await repo.insertLogs(logsToWrite);
        } catch (err) {
            console.error('Failed to flush logs to retention DB:', err);
        }
    }

    private async cleanupLogs() {
        const dbType = process.env.DB_TYPE?.toLowerCase() || 'json';
        if (dbType !== 'mongo' && dbType !== 'mongodb') {
            return;
        }
        
        try {
            const repo = await DatabaseFactory.getLogRepository();
            const retentionDays = parseInt(process.env.LOG_RETENTION_DAYS || '7', 10);
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - retentionDays);
            
            const deleted = await repo.deleteLogsBefore(cutoff);
            if (deleted > 0) {
                console.log(`🧹 LogRetentionService: Cleaned up ${deleted} old logs.`);
            }
        } catch (err) {
            console.error('Failed to cleanup logs:', err);
        }
    }
}
