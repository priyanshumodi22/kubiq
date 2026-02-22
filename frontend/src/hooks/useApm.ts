import { useState, useEffect, useCallback } from 'react';

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

    const fetchMetrics = useCallback(async (timeRangeMs: number = 60 * 60 * 1000) => {
        try {
            setLoading(true);
            setError(null);

            // Get base URL for API requests. Usually relative in prod, or specific port in dev
            const baseUrl = import.meta.env.VITE_API_URL || '';
            const BACKEND_CONTEXT_PATH = import.meta.env.VITE_BACKEND_CONTEXT_PATH || '';

            // IMPORTANT: Include credentials for the authMiddleware
            const response = await fetch(`${baseUrl}${BACKEND_CONTEXT_PATH}/api/apm/services?timeRangeMs=${timeRangeMs}`, {
                credentials: 'omit', // We temporarily made it public, but omitting is safer for cross-origin testing initially if no cookies are set
            });

            if (!response.ok) {
                // If 401, it means the authMiddleware is blocking it
                if (response.status === 401) {
                    throw new Error('Unauthorized to access APM data');
                }
                throw new Error(`Failed to fetch APM metrics: ${response.statusText}`);
            }

            const data = await response.json();
            setMetrics(data);
        } catch (err: any) {
            console.error('APM Hook Error:', err);
            setError(err.message || 'An unknown error occurred while fetching APM metrics.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMetrics();
        // Auto-refresh every 15 seconds
        const intervalId = setInterval(() => fetchMetrics(), 15000);
        return () => clearInterval(intervalId);
    }, [fetchMetrics]);

    return { metrics, loading, error, refresh: fetchMetrics };
}
