import { useState, useCallback } from 'react';
import { apiClient } from '../services/api';
import { requestErrorMessage, requestErrorStatus } from '../utils/requestError';

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
    attributes: Record<string, unknown>;
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
        } catch (err) {
            console.error('Trace Fetch Error:', err);
            if (requestErrorStatus(err) === 404) {
                setError('Trace not found');
            } else {
                setError(requestErrorMessage(err, 'An unknown error occurred while fetching trace.', 'error'));
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
