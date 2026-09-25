import { useState, useCallback } from 'react';
import { apiClient } from '../services/api';

export interface IServiceDependency {
    source: string;
    target: string;
    callCount: number;
    errorCount: number;
}

export function useServiceMap() {
    const [dependencies, setDependencies] = useState<IServiceDependency[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchServiceMap = useCallback(async (options: { timeRangeMs?: number; fromMs?: number; toMs?: number } = {}) => {
        try {
            const timeRangeMs = options.timeRangeMs || 60 * 60 * 1000;
            const params: Record<string, string> = { timeRange: timeRangeMs.toString() };
            if (options.fromMs) params.fromMs = options.fromMs.toString();
            if (options.toMs) params.toMs = options.toMs.toString();

            setLoading(true);
            setError(null);

            const data = await apiClient.getApmServiceMap(params);
            setDependencies(data);
        } catch (err: any) {
            console.error('Service Map Fetch Error:', err);
            setError(err?.response?.data?.error || err.message || 'An unknown error occurred while fetching service map.');
        } finally {
            setLoading(false);
        }
    }, []);

    return { dependencies, loading, error, fetchServiceMap };
}
