import { DatabaseFactory } from '../database/DatabaseFactory';
import { ISpan } from '../database/interfaces/ITraceRepository';

export class IngestionBufferService {
    private static instance: IngestionBufferService;
    private logBuffer: any[] = [];
    private spanBuffer: ISpan[] = [];
    private flushInterval: NodeJS.Timeout;

    private constructor() {
        // flush logs and spans every 2 seconds
        this.flushInterval = setInterval(() => this.flushData(), 2000);
    }

    public static getInstance(): IngestionBufferService {
        if (!IngestionBufferService.instance) {
            IngestionBufferService.instance = new IngestionBufferService();
        }
        return IngestionBufferService.instance;
    }

    /**
     * Ingest raw log lines (used by local file tailer).
     */
    public ingestLines(serviceName: string, sourceName: string, lines: string[]) {
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

    /**
     * Ingest structured logs (used by FluentBit / kubiq-agent over HTTP).
     */
    public addLogs(logs: any[]) {
        this.logBuffer.push(...logs);
    }

    /**
     * Ingest APM Spans (used by kubiq-apm over OTLP).
     */
    public addSpans(spans: ISpan[]) {
        this.spanBuffer.push(...spans);
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

        return 'INFO'; // default
    }

    private async flushData() {
        if (this.logBuffer.length === 0 && this.spanBuffer.length === 0) return;

        const logsToWrite = [...this.logBuffer];
        const spansToWrite = [...this.spanBuffer];
        
        this.logBuffer = [];
        this.spanBuffer = [];

        try {
            if (logsToWrite.length > 0) {
                const logRepo = await DatabaseFactory.getLogRepository();
                await logRepo.insertLogs(logsToWrite);
            }
        } catch (err) {
            console.error('Failed to flush logs to database:', err);
        }

        try {
            if (spansToWrite.length > 0) {
                // Ensure APM is supported before fetching the TraceRepository
                if (DatabaseFactory.isApmSupported()) {
                    const traceRepo = await DatabaseFactory.getTraceRepository();
                    await traceRepo.insertSpans(spansToWrite);
                }
            }
        } catch (err) {
            console.error('Failed to flush spans to database:', err);
        }
    }
}
