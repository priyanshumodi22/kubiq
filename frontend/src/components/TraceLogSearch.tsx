import { LogCorrelationLinks } from './LogCorrelationLinks';
import { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { Virtuoso } from 'react-virtuoso';
import { Search, RefreshCw } from 'lucide-react';
import { apiClient, type TraceLogResult } from '../services/api';
import { useToast } from '../contexts/ToastContext';

function renderLog(_index: number, log: TraceLogResult['logs'][number]) {
    return <article className="border-b border-gray-800 px-4 py-3 font-mono text-xs">
        <div className="mb-2 flex flex-wrap gap-3 text-text-dim"><time>{new Date(log.timestamp).toLocaleString()}</time><span>{log.level}</span><span>{log.serviceName} / {log.sourceName}</span></div>
        <pre className="whitespace-pre-wrap break-all text-gray-200">{log.message}</pre><LogCorrelationLinks message={log.message} record={log} />
    </article>;
}

export function TraceLogSearch({ traceId, serviceName, onAllSources, spanId, onWholeTrace }: Readonly<{ traceId: string; serviceName?: string; spanId?: string; onWholeTrace?: () => void; onAllSources: () => void }>) {
    const { addToast } = useToast();
    const [result, setResult] = useState<TraceLogResult | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true); setResult(null); setError('');
        apiClient.getTraceLogs(traceId, serviceName, controller.signal, spanId).then(value => {
            if (!controller.signal.aborted) setResult(value);
        }).catch((error_: unknown) => {
            if (controller.signal.aborted) return;
            const message = isAxiosError<{ message?: string }>(error_) ? error_.response?.data?.message || 'Trace log search failed. Please retry.' : 'Trace log search failed. Please retry.';
            setError(message); addToast(message, 'error');
        }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [traceId, serviceName, spanId, attempt, addToast]);
    return <section className="flex min-h-0 flex-1 flex-col" aria-label="Trace logs">
        <header className="space-y-3 border-b border-gray-800 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold text-gray-100"><Search className="h-4 w-4 text-primary" />Trace logs</h2>
                <button type="button" onClick={() => setAttempt(value => value + 1)} className="flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-200 focus-visible:ring-2 focus-visible:ring-primary"><RefreshCw className="h-3 w-3" />Search again</button></div>
            <p className="break-all font-mono text-xs text-text-dim">Trace ID: {traceId}</p>
            {spanId && <div className="flex flex-wrap items-center gap-3 text-xs text-text-dim"><span>Span ID: {spanId}</span><button type="button" onClick={onWholeTrace} className="text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary">Search entire trace</button></div>}
            <div className="flex flex-wrap items-center gap-3 text-xs text-text-dim"><span>{serviceName ? `Source: ${serviceName}` : 'All permitted retained sources'}</span>{serviceName && <button type="button" className="text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary" onClick={onAllSources}>Search all permitted sources</button>}</div>
            {result && <p className="text-xs text-text-dim">{new Date(result.fromMs).toLocaleString()} – {new Date(result.toMs).toLocaleString()} · {result.logs.length} matching logs{result.truncated || result.logs.length === 500 ? ' (result limit reached)' : ''}</p>}
        </header>
        {loading && <output className="p-6 text-sm text-text-dim">Searching retained logs…</output>}
        {error && <p role="alert" className="p-6 text-sm text-red-400">{error}</p>}
        {!loading && !error && result?.logs.length === 0 && <div className="m-auto max-w-lg space-y-3 p-6 text-center"><h3 className="font-medium text-gray-200">No correlated logs retained</h3><p className="text-sm text-text-dim">No recorded log contains this trace ID in the search window. Traces do not create application logs retroactively.</p><p className="text-xs text-text-dim">New eligible kubiq requests record completion logs with trace and span IDs. Other services must include trace IDs in their logs; Kubernetes streams collect only while a viewer is connected.</p></div>}
        {!loading && !error && !!result?.logs.length && <Virtuoso className="flex-1" data={result.logs} itemContent={renderLog} />}
    </section>;
}
