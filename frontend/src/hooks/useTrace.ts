import { useState, useCallback } from 'react';

export interface ISpan {
    traceId: string;
    spanId: string;
    parentSpanId: string | null;
    serviceName: string;
    name: string;
    kind: number;
    startTimeUnixNano: number;
    endTimeUnixNano: number;
    durationMs: number;
    statusCode: number;
    attributes: Record<string, any>;
    timestamp: Date;
}

export function useTrace() {
    const [spans, setSpans] = useState<ISpan[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchTrace = useCallback(async (traceId: string) => {
        if (!traceId.trim()) {
            setSpans([]);
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const baseUrl = import.meta.env.VITE_API_URL || '';
            const BACKEND_CONTEXT_PATH = import.meta.env.VITE_BACKEND_CONTEXT_PATH || '';

            const response = await fetch(`${baseUrl}${BACKEND_CONTEXT_PATH}/api/apm/traces/${traceId}`, {
                credentials: 'omit',
            });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Trace not found');
                }
                throw new Error(`Failed to fetch trace: ${response.statusText}`);
            }

            const data = await response.json();
            setSpans(data);
        } catch (err: any) {
            console.error('Trace Fetch Error:', err);
            setError(err.message || 'An unknown error occurred while fetching trace.');
            setSpans([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const clearTrace = useCallback(() => {
        setSpans([]);
        setError(null);
    }, []);

    return { spans, loading, error, fetchTrace, clearTrace };
}
