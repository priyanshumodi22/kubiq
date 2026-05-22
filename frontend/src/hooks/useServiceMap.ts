import { useState, useCallback } from 'react';

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
            const params = new URLSearchParams();
            if (options.fromMs) params.append('fromMs', options.fromMs.toString());
            if (options.toMs) params.append('toMs', options.toMs.toString());
            params.append('timeRange', timeRangeMs.toString());
            setLoading(true);
            setError(null);

            const baseUrl = import.meta.env.VITE_API_URL || '';
            const BACKEND_CONTEXT_PATH = import.meta.env.VITE_BACKEND_CONTEXT_PATH || '';

            const response = await fetch(`${baseUrl}${BACKEND_CONTEXT_PATH}/api/apm/service-map?${params.toString()}`, {
                credentials: 'omit',
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch service map: ${response.statusText}`);
            }

            const data = await response.json();
            setDependencies(data);
        } catch (err: any) {
            console.error('Service Map Fetch Error:', err);
            setError(err.message || 'An unknown error occurred while fetching service map.');
        } finally {
            setLoading(false);
        }
    }, []);

    return { dependencies, loading, error, fetchServiceMap };
}
