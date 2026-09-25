import { useState, useCallback } from 'react';
import { apiClient } from '../services/api';

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

            const data = await apiClient.getApmTrace(traceId);
            setSpans(data);
        } catch (err: any) {
            console.error('Trace Fetch Error:', err);
            if (err?.response?.status === 404) {
                setError('Trace not found');
            } else {
                setError(err?.response?.data?.error || err.message || 'An unknown error occurred while fetching trace.');
            }
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
