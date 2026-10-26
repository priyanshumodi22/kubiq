import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../services/api';
import { requestErrorMessage } from '../utils/requestError';

export interface ServiceMetrics {
    serviceName: string;
    requestCount: number;
    errorCount: number;
    avgDurationMs: number;
    p50DurationMs?: number;
    p90DurationMs?: number;
    p95DurationMs: number;
    p99DurationMs?: number;
    rpm: number;
    errorRate: number;
}

export function useApm() {
    const [metrics, setMetrics] = useState<ServiceMetrics[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const selectedRange = useRef<{ timeRangeMs?: number; fromMs?: number; toMs?: number }>({});

    const fetchMetrics = useCallback(async (options?: { timeRangeMs?: number; fromMs?: number; toMs?: number }) => {
        if (options) selectedRange.current = { ...options };
        const range = selectedRange.current;
        try {
            const timeRangeMs = range.timeRangeMs || 60 * 60 * 1000;
            const params: Record<string, string> = { timeRangeMs: timeRangeMs.toString() };
            if (range.fromMs) params.fromMs = range.fromMs.toString();
            if (range.toMs) params.toMs = range.toMs.toString();

            setLoading(true);
            setError(null);

            const data = await apiClient.getApmServices(params);
            setMetrics(data);
        } catch (err) {
            console.error('APM Hook Error:', err);
            setError(requestErrorMessage(err, 'An unknown error occurred while fetching APM metrics.', 'error'));
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
