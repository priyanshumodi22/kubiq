import fs from 'fs';
import path from 'path';

export interface AuditLogEntry {
    id: string;
    timestamp: string;
    user: string;
    action: 'TTY_EXEC' | 'MANIFEST_APPLY' | 'DEPLOYMENT_SCALE' | 'DEPLOYMENT_RESTART' | 'RESOURCE_DELETE' | 'AUTH_LOGIN' | 'AUTH_ROLE_CHANGE';
    target: string;
    details?: string;
    ip?: string;
}

export class AuditLogService {
    private static instance: AuditLogService;
    private logFilePath: string;
    private memoryLogs: AuditLogEntry[] = [];

    private constructor() {
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
            try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
        }
        this.logFilePath = path.join(dataDir, 'audit_logs.json');
        this.loadLogs();
    }

    public static getInstance(): AuditLogService {
        if (!AuditLogService.instance) {
            AuditLogService.instance = new AuditLogService();
        }
        return AuditLogService.instance;
    }

    private loadLogs() {
        try {
            if (fs.existsSync(this.logFilePath)) {
                const raw = fs.readFileSync(this.logFilePath, 'utf-8');
                this.memoryLogs = JSON.parse(raw);
            }
        } catch (e) {
            console.warn('⚠️ Failed to read audit_logs.json, initializing empty log store.');
            this.memoryLogs = [];
        }
    }

    private saveLogs() {
        try {
            // Keep last 5000 audit entries
            if (this.memoryLogs.length > 5000) {
                this.memoryLogs = this.memoryLogs.slice(-5000);
            }
            fs.writeFileSync(this.logFilePath, JSON.stringify(this.memoryLogs, null, 2), 'utf-8');
        } catch (e) {
            console.error('❌ Failed to write to audit_logs.json:', e);
        }
    }

    public async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
        const fullEntry: AuditLogEntry = {
            id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            timestamp: new Date().toISOString(),
            ...entry
        };

        this.memoryLogs.unshift(fullEntry);
        this.saveLogs();
        console.log(`🛡️ [AuditLog] [${fullEntry.action}] User: ${fullEntry.user} → Target: ${fullEntry.target}`);
        return fullEntry;
    }

    public getLogs(limit: number = 100, search?: string): AuditLogEntry[] {
        let filtered = this.memoryLogs;
        if (search && search.trim()) {
            const q = search.toLowerCase();
            filtered = filtered.filter(l => 
                l.user.toLowerCase().includes(q) ||
                l.action.toLowerCase().includes(q) ||
                l.target.toLowerCase().includes(q) ||
                (l.details && l.details.toLowerCase().includes(q))
            );
        }
        return filtered.slice(0, limit);
    }
}
