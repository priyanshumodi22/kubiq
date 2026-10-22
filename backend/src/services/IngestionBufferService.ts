import { DatabaseFactory } from '../database/DatabaseFactory';
import { ISpan } from '../database/interfaces/ITraceRepository';

export class IngestionBufferService {
    private static instance: IngestionBufferService;
    private logBuffer: any[] = [];
    private spanBuffer: ISpan[] = [];
    private pendingLogCount = 0;
    private pendingSpanCount = 0;
    private isFlushing = false;
    private readonly flushInterval: NodeJS.Timeout;
    private readonly maxBufferedLogs = this.readPositiveLimit('KUBIQ_INGESTION_MAX_BUFFERED_LOGS', 10_000);
    private readonly maxBufferedSpans = this.readPositiveLimit('KUBIQ_INGESTION_MAX_BUFFERED_SPANS', 10_000);

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
        const logs: any[] = [];
        for (const line of lines) {
            if (!line.trim()) continue;
            logs.push({
                serviceName,
                sourceName,
                timestamp: new Date(),
                level: this.extractLevel(line),
                message: line
            });
        }
        // Local/Kubernetes stream callers have no response channel. Retain as
        // much as the bounded queue can hold and drop the overflow safely.
        const accepted = logs.slice(0, this.availableLogCapacity());
        if (accepted.length > 0) this.logBuffer.push(...accepted);
    }

    /**
     * Ingest structured logs (used by FluentBit / kubiq-agent over HTTP).
     */
    public addLogs(logs: any[]): boolean {
        if (logs.length > this.availableLogCapacity()) return false;
        this.logBuffer.push(...logs);
        return true;
    }

    /**
     * Ingest APM Spans (used by kubiq-apm over OTLP).
     */
    public addSpans(spans: ISpan[]): boolean {
        if (spans.length > this.availableSpanCapacity()) return false;
        this.spanBuffer.push(...spans);
        return true;
    }

    private extractLevel(content: string): string {
        const explicitMatch =
            /\[(ERROR|WARN|WARNING|INFO|DEBUG|TRACE|FATAL|PANIC|CRITICAL)\]/i.exec(content) ||
            /\b(?:level|severity|lvl)["']?\s*[:=]\s*["']?(error|warn|warning|info|debug|trace|fatal|panic|critical)\b/i.exec(content) ||
            /^(?:[\d-T:.Z\s+]+)?\b(ERROR|WARN|WARNING|INFO|DEBUG|TRACE|FATAL|PANIC|CRITICAL)\b/i.exec(content);

        if (explicitMatch) {
            const found = explicitMatch[1].toLowerCase();
            if (['error', 'fatal', 'panic', 'critical'].includes(found)) return 'ERROR';
            if (['warn', 'warning'].includes(found)) return 'WARN';
            if (['info', 'information'].includes(found)) return 'INFO';
            if (['debug', 'trace'].includes(found)) return 'DEBUG';
        }

        return 'INFO'; // default
    }

    private readPositiveLimit(name: string, fallback: number): number {
        const value = Number.parseInt(process.env[name] || '', 10);
        return Number.isSafeInteger(value) && value > 0 ? value : fallback;
    }

    private availableLogCapacity(): number {
        return Math.max(0, this.maxBufferedLogs - this.logBuffer.length - this.pendingLogCount);
    }

    private availableSpanCapacity(): number {
        return Math.max(0, this.maxBufferedSpans - this.spanBuffer.length - this.pendingSpanCount);
    }

    private async flushData() {
        if (this.isFlushing || (this.logBuffer.length === 0 && this.spanBuffer.length === 0)) return;
        this.isFlushing = true;

        const logsToWrite = [...this.logBuffer];
        const spansToWrite = [...this.spanBuffer];
        this.logBuffer = [];
        this.spanBuffer = [];
        this.pendingLogCount += logsToWrite.length;
        this.pendingSpanCount += spansToWrite.length;

        try {
            if (logsToWrite.length > 0) {
                const logRepo = await DatabaseFactory.getLogRepository();
                await logRepo.insertLogs(logsToWrite);
            }
        } catch (err) {
            console.error('Failed to flush logs to database:', err);
        } finally {
            this.pendingLogCount -= logsToWrite.length;
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
        } finally {
            this.pendingSpanCount -= spansToWrite.length;
            this.isFlushing = false;
        }
    }
}
