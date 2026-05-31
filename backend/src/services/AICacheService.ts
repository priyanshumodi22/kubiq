import NodeCache from 'node-cache';
import crypto from 'crypto';

export interface AISummaryCacheEntry {
    summary: string;
    timestamp: number;
    timeBucketStart: number;
    timeBucketEnd: number;
}

export class AICacheService {
    private static instance: AICacheService;
    private cache: NodeCache;

    private constructor() {
        // Initialize cache with 4 hour standard TTL
        // checkperiod controls how frequently the cache is checked for expired keys
        this.cache = new NodeCache({ stdTTL: 4 * 60 * 60, checkperiod: 600 });
    }

    public static getInstance(): AICacheService {
        if (!AICacheService.instance) {
            AICacheService.instance = new AICacheService();
        }
        return AICacheService.instance;
    }

    /**
     * Generates a deterministic cache key for a given service and 15-minute time bucket.
     * We hash the serviceName to ensure there are no key collisions with weird characters.
     */
    private generateKey(serviceName: string, timeBucketStart: number): string {
        const hash = crypto.createHash('md5').update(serviceName).digest('hex');
        return `ai_summary_${hash}_${timeBucketStart}`;
    }

    /**
     * Calculates the start and end timestamp of the 15-minute bucket for a given timestamp
     */
    public calculateTimeBucket(timestamp: number = Date.now()): { start: number, end: number } {
        const FIFTEEN_MINUTES = 15 * 60 * 1000;
        const start = Math.floor(timestamp / FIFTEEN_MINUTES) * FIFTEEN_MINUTES;
        return { start, end: start + FIFTEEN_MINUTES };
    }

    /**
     * Gets a summary for a specific time bucket if it exists
     */
    public getSummary(serviceName: string, timeBucketStart: number): AISummaryCacheEntry | undefined {
        const key = this.generateKey(serviceName, timeBucketStart);
        return this.cache.get<AISummaryCacheEntry>(key);
    }

    /**
     * Saves a summary to the cache for a specific time bucket
     */
    public saveSummary(serviceName: string, timeBucketStart: number, timeBucketEnd: number, summary: string): void {
        const key = this.generateKey(serviceName, timeBucketStart);
        const entry: AISummaryCacheEntry = {
            summary,
            timestamp: Date.now(),
            timeBucketStart,
            timeBucketEnd
        };
        this.cache.set(key, entry);
    }

    /**
     * Gets the most recent summary for a given service across ANY time bucket.
     * This is used for the "Recent Insights" banner.
     */
    public getMostRecentSummary(serviceName: string): AISummaryCacheEntry | null {
        const keys = this.cache.keys();
        const serviceHash = crypto.createHash('md5').update(serviceName).digest('hex');
        const prefix = `ai_summary_${serviceHash}_`;
        
        let mostRecent: AISummaryCacheEntry | null = null;

        for (const key of keys) {
            if (key.startsWith(prefix)) {
                const entry = this.cache.get<AISummaryCacheEntry>(key);
                if (entry) {
                    if (!mostRecent || entry.timestamp > mostRecent.timestamp) {
                        mostRecent = entry;
                    }
                }
            }
        }

        return mostRecent;
    }
}
