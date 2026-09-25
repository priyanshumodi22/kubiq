import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api';

export interface ServiceMetrics {
    serviceName: string;
    requestCount: number;
    errorCount: number;
    avgDurationMs: number;
    p95DurationMs: number;
    rpm: number;
    errorRate: number;
}

export function useApm() {
    const [metrics, setMetrics] = useState<ServiceMetrics[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchMetrics = useCallback(async (options: { timeRangeMs?: number; fromMs?: number; toMs?: number } = {}) => {
        try {
            const timeRangeMs = options.timeRangeMs || 60 * 60 * 1000;
            const params: Record<string, string> = { timeRangeMs: timeRangeMs.toString() };
            if (options.fromMs) params.fromMs = options.fromMs.toString();
            if (options.toMs) params.toMs = options.toMs.toString();

            setLoading(true);
            setError(null);

            const data = await apiClient.getApmServices(params);
            setMetrics(data);
        } catch (err: any) {
            console.error('APM Hook Error:', err);
            setError(err?.response?.data?.error || err.message || 'An unknown error occurred while fetching APM metrics.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMetrics();
        const intervalId = setInterval(() => fetchMetrics(), 15000);
        return () => clearInterval(intervalId);
    }, [fetchMetrics]);

    return { metrics, loading, error, refresh: fetchMetrics };
}
