import { Link, useInRouterContext } from 'react-router-dom';
import { SpanCallDetails } from './SpanCallDetails';
import React from 'react';
import { createPortal } from 'react-dom';
import { X, Database, Globe, Info, Clock, Terminal, Settings, MessageSquare, Cpu, Cloud, Zap, AlertTriangle } from 'lucide-react';
import { ISpan } from '../hooks/useTrace';

interface SpanDetailsSidebarProps {
    span: ISpan | null;
    onClose: () => void;
    traceSpans?: ISpan[];
}

function SpanAttributeValue({ name, value }: Readonly<{ name: string; value: unknown }>) {
    if (name === 'db.statement' || name === 'db.query.text') {
        return <div className="bg-black/30 p-2 rounded border border-gray-800 text-blue-300 text-xs shadow-inner max-h-40 overflow-y-auto">{String(value)}</div>;
    }
    if (name === 'http.url') {
        return <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{String(value)}</a>;
    }
    if (value !== null && typeof value === 'object') return <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(value, null, 2)}</pre>;
    return String(value);
}

function SpanLogsLink({ span }: Readonly<{ span: ISpan }>) {
    const inRouter = useInRouterContext();
    if (!inRouter) return null;
    return <Link to={`/logs?traceId=${encodeURIComponent(span.traceId)}&spanId=${encodeURIComponent(span.spanId)}`} target="_blank" rel="noreferrer" className="mb-4 inline-flex rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-primary">View Span Logs</Link>;
}

export const SpanDetailsSidebar: React.FC<SpanDetailsSidebarProps> = ({ span, onClose, traceSpans = [] }) => {
    if (!span) return null;

    // Helper to determine the icon based on OTel semantic conventions
    const getSystemIcon = () => {
        if (!span.attributes) return <Settings className="w-5 h-5 text-gray-400" />;

        // 1. Errors / Exceptions
        if (span.attributes['exception.type'] || span.statusCode === 2) return <AlertTriangle className="w-5 h-5 text-red-500" />;

        // 2. Databases (MySQL, Postgres, Mongo, Redis, etc.)
        if (span.attributes['db.system']) return <Database className="w-5 h-5 text-blue-400" />;

        // 3. Messaging Queues (Kafka, RabbitMQ, SQS, etc.)
        if (span.attributes['messaging.system']) return <MessageSquare className="w-5 h-5 text-purple-400" />;

        // 4. RPC / gRPC (Internal microservice communication)
        if (span.attributes['rpc.system']) return <Cpu className="w-5 h-5 text-orange-400" />;

        // 5. Cloud & Serverless (AWS Lambda, Google Cloud Functions, etc.)
        if (span.attributes['faas.trigger']) return <Zap className="w-5 h-5 text-yellow-400" />;
        if (span.attributes['cloud.provider']) return <Cloud className="w-5 h-5 text-sky-400" />;

        // 6. HTTP (REST API, Web traffic)
        if (span.attributes['http.url'] || span.attributes['http.method'] || span.attributes['http.request.method']) return <Globe className="w-5 h-5 text-green-400" />;

        // Default fallback for internal code blocks
        return <Terminal className="w-5 h-5 text-gray-400" />;
    };

    const isError = span.statusCode === 2;
    const durationMs = (span.endTimeUnixNano - span.startTimeUnixNano) / 1000000;

    return createPortal(
        <>
            {/* Backdrop for mobile closing */}
            <button
                type="button"
                tabIndex={-1}
                aria-label="Dismiss span details"
                className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden animate-fade-in"
                onClick={onClose}
            />

            {/* Sidebar drawer */}
            <div className="fixed top-0 right-0 h-dvh w-full max-w-xl bg-bg-surface/95 backdrop-blur-xl border-l border-gray-800 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col pb-[env(safe-area-inset-bottom)]">

                {/* Header */}
                <div className="p-4 shrink-0 border-b border-gray-800 flex justify-between items-start bg-bg-card/50">
                    <div className="flex min-w-0 items-start gap-3">
                        <div className="p-2 bg-white/5 rounded-lg border border-gray-700">
                            {getSystemIcon()}
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white leading-tight break-words [overflow-wrap:anywhere]">{span.name}</h2>
                            <p className="text-sm text-gray-400 font-mono mt-1">{span.serviceName}</p>
                        </div>
                    </div>
                    <button
                        aria-label="Close span details"
                        onClick={onClose}
                        className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content Body */}
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 custom-scrollbar">

                    {/* Status & Timing Banner */}
                    <div className={`p-4 rounded-xl mb-6 border ${isError ? 'bg-red-500/10 border-red-500/30' : 'bg-primary/5 border-primary/20'}`}>
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-gray-400">Status</span>
                            <span className={`text-sm font-bold ${isError ? 'text-red-400' : 'text-green-400'}`}>
                                {isError ? 'Error' : 'Ok'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-400 flex items-center gap-1.5">
                                <Clock className="w-4 h-4" /> Duration
                            </span>
                            <span className="text-white font-mono">{durationMs.toFixed(2)} ms</span>
                        </div>
                    </div>

                    <SpanLogsLink span={span} />
                    <SpanCallDetails span={span} traceSpans={traceSpans} />
                    {/* Attributes Table */}
                    <div className="mb-6">
                        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Info className="w-4 h-4" /> Span Attributes
                        </h3>

                        {span.attributes && Object.keys(span.attributes).length > 0 ? (
                            <div className="bg-bg-card border border-gray-800 rounded-xl overflow-hidden shadow-inner">
                                <table className="w-full table-fixed text-left text-xs">
                                    <tbody className="divide-y divide-gray-800">
                                        {Object.entries(span.attributes).map(([key, value]) => (
                                            <tr key={key} className="hover:bg-white/5 transition-colors group">
                                                <td className="px-4 py-3 align-top font-medium text-gray-400 border-r border-gray-800/50 w-[45%] break-words [overflow-wrap:anywhere]">
                                                    {key}
                                                </td>
                                                <td className="px-4 py-3 align-top font-mono text-gray-300 break-all select-all">
                                                    {/* Highlight DB Statements */}
                                                    <SpanAttributeValue name={key} value={value} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="text-center p-6 bg-white/5 rounded-xl border border-dashed border-gray-700">
                                <p className="text-gray-500 text-sm">No OpenTelemetry attributes recorded for this span.</p>
                            </div>
                        )}
                    </div>

                    {/* Raw Identifiers (Hidden by default, useful for debugging) */}
                    <div>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Internal Identifiers</h3>
                        <div className="space-y-1 font-mono text-[10px] text-gray-600">
                            <div>Span ID: {span.spanId}</div>
                            <div>Trace ID: {span.traceId}</div>
                            {span.parentSpanId && <div>Parent ID: {span.parentSpanId}</div>}
                        </div>
                    </div>
                </div>
            </div>
        </>,
        document.body
    );
};
