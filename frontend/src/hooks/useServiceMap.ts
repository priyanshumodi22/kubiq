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

    const fetchServiceMap = useCallback(async (timeRangeMs: number) => {
        try {
            setLoading(true);
            setError(null);

            const baseUrl = import.meta.env.VITE_API_URL || '';
            const BACKEND_CONTEXT_PATH = import.meta.env.VITE_BACKEND_CONTEXT_PATH || '';

            const response = await fetch(`${baseUrl}${BACKEND_CONTEXT_PATH}/api/apm/service-map?timeRange=${timeRangeMs}`, {
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
