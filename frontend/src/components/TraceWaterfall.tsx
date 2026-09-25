import { useMemo, useState } from 'react';
import { ISpan } from '../hooks/useTrace';
import { Clock, Server, FileText } from 'lucide-react';
import { SpanDetailsSidebar } from './SpanDetailsSidebar';

interface TraceWaterfallProps {
    spans: ISpan[];
}

interface SpanNode extends ISpan {
    children: SpanNode[];
    depth: number;
}

function getSpanLayerColor(span: ISpan): { bg: string; border: string; badge: string } {
    if (span.statusCode === 2) {
        return { bg: 'bg-red-500/80', border: 'border-red-400', badge: 'bg-red-500' };
    }
    const name = (span.name || '').toLowerCase();
    const kind = String(span.kind || '').toLowerCase();

    if (name.startsWith('select') || name.startsWith('insert') || name.startsWith('update') || name.startsWith('delete') || name.includes('db') || name.includes('sql') || name.includes('query')) {
        return { bg: 'bg-amber-500/80', border: 'border-amber-400', badge: 'bg-amber-400' };
    }
    if (name.includes('middleware') || name.includes('auth') || name.includes('session')) {
        return { bg: 'bg-purple-500/80', border: 'border-purple-400', badge: 'bg-purple-400' };
    }
    if (kind === 'client' || name.includes('fetch') || name.includes('axios') || name.includes('outbound')) {
        return { bg: 'bg-cyan-500/80', border: 'border-cyan-400', badge: 'bg-cyan-400' };
    }
    return { bg: 'bg-blue-500/80', border: 'border-blue-400', badge: 'bg-blue-400' };
}

export default function TraceWaterfall({ spans }: TraceWaterfallProps) {
    const [selectedSpan, setSelectedSpan] = useState<ISpan | null>(null);

    // 1. Build the Tree
    const { rootSpans, minStartTime, totalDurationMs } = useMemo(() => {
        if (!spans || spans.length === 0) {
            return { rootSpans: [], minStartTime: 0, maxEndTime: 0, totalDurationMs: 0 };
        }

        let minStart = spans.length > 0 ? spans[0].startTimeUnixNano : 0;
        let maxEnd = spans.length > 0 ? spans[0].endTimeUnixNano : 0;

        const spanMap = new Map<string, SpanNode>();
        const roots: SpanNode[] = [];

        spans.forEach(span => {
            spanMap.set(span.spanId, { ...span, children: [], depth: 0 });
            if (span.startTimeUnixNano < minStart) minStart = span.startTimeUnixNano;
            if (span.endTimeUnixNano > maxEnd) maxEnd = span.endTimeUnixNano;
        });

        spanMap.forEach(node => {
            if (node.parentSpanId && spanMap.has(node.parentSpanId)) {
                const parent = spanMap.get(node.parentSpanId)!;
                parent.children.push(node);
            } else {
                roots.push(node);
            }
        });

        const assignDepth = (node: SpanNode, currentDepth: number) => {
            node.depth = currentDepth;
            node.children.sort((a, b) => a.startTimeUnixNano - b.startTimeUnixNano);
            node.children.forEach(child => assignDepth(child, currentDepth + 1));
        };

        roots.sort((a, b) => a.startTimeUnixNano - b.startTimeUnixNano);
        roots.forEach(root => assignDepth(root, 0));

        const totalMs = (maxEnd - minStart) / 1000000;

        return {
            rootSpans: roots,
            minStartTime: minStart,
            maxEndTime: maxEnd,
            totalDurationMs: totalMs > 0 ? totalMs : 1
        };
    }, [spans]);

    if (rootSpans.length === 0) return null;

    const traceId = spans[0]?.traceId;

    const renderNode = (node: SpanNode) => {
        const startOffsetMs = (node.startTimeUnixNano - minStartTime) / 1000000;
        const leftPercent = (startOffsetMs / totalDurationMs) * 100;

        let widthPercent = (node.durationMs / totalDurationMs) * 100;
        if (widthPercent < 0.5) widthPercent = 0.5;
        if (widthPercent > 100) widthPercent = 100;

        const layerColor = getSpanLayerColor(node);

        return (
            <div key={node.spanId} className="flex flex-col mb-1 group">
                <div
                    onClick={() => setSelectedSpan(node)}
                    className={`flex items-center text-sm py-1 rounded px-2 transition-colors relative cursor-pointer ${selectedSpan?.spanId === node.spanId ? 'bg-primary/20 border border-primary/30' : 'hover:bg-white/5 border border-transparent'}`}
                >
                    <div className="w-1/3 flex-shrink-0 flex items-center pr-4 overflow-hidden" style={{ paddingLeft: `${node.depth * 16}px` }}>
                        <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${layerColor.badge}`}></span>
                                <span className="font-medium text-white truncate text-xs sm:text-sm">{node.name}</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-gray-500 ml-3.5 mt-0.5 min-w-0">
                                <Server className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{node.serviceName}</span>
                            </div>
                        </div>
                    </div>

                    <div className="w-2/3 flex-grow relative h-6 border-l border-gray-800 flex items-center">
                        <div
                            className={`absolute h-4 rounded-sm ${layerColor.bg} border ${layerColor.border}`}
                            style={{
                                left: `${leftPercent}%`,
                                width: `${Math.min(widthPercent, 100 - leftPercent)}%`,
                                minWidth: '4px'
                            }}
                        />

                        <span
                            className={`absolute font-mono text-xs z-10 px-1 py-0.5 rounded ${widthPercent >= 15 ? 'text-white bg-black/20' : 'text-gray-300'}`}
                            style={{
                                left: widthPercent >= 15
                                    ? `calc(${leftPercent}% + 8px)`
                                    : (leftPercent + widthPercent > 85 ? 'auto' : `calc(${leftPercent + widthPercent}% + 6px)`),
                                right: widthPercent >= 15
                                    ? 'auto'
                                    : (leftPercent + widthPercent > 85 ? `calc(${100 - leftPercent}% + 6px)` : 'auto'),
                            }}
                        >
                            {node.durationMs.toFixed(2)}ms
                        </span>
                    </div>
                </div>

                {node.children.map(child => renderNode(child))}
            </div>
        );
    };

    return (
        <div className="bg-bg-surface/40 backdrop-blur-md border border-gray-800 rounded-xl overflow-hidden shadow-2xl mt-8 animate-fade-in-up relative z-10">
            <div className="p-4 border-b border-gray-800 bg-bg-surface/60 flex justify-between items-center">
                <h3 className="font-bold text-white flex items-center gap-2">
                    <Clock className="w-5 h-5 text-primary" />
                    Trace Waterfall
                </h3>
                <div className="flex items-center gap-4">
                    {traceId && (
                        <a
                            href={`/logs?search=${traceId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-lg text-xs font-semibold transition-all"
                            title="View all logs correlated to this trace ID"
                        >
                            <FileText className="w-3.5 h-3.5" />
                            <span>View Spanned Logs</span>
                        </a>
                    )}
                    <div className="text-sm font-mono text-gray-400">
                        Total Duration: <span className="text-white font-bold">{totalDurationMs.toFixed(2)}ms</span>
                    </div>
                </div>
            </div>

            <div className="p-4 overflow-x-auto">
                <div className="min-w-[600px]">
                    <div className="flex text-xs font-medium text-gray-500 mb-2 px-2 border-b border-gray-800 pb-2">
                        <div className="w-1/3 text-left">Operation Name</div>
                        <div className="w-2/3 text-left pl-2">Timeline</div>
                    </div>
                    <div className="flex flex-col">
                        {rootSpans.map(root => renderNode(root))}
                    </div>
                </div>
            </div>

            <SpanDetailsSidebar
                span={selectedSpan}
                onClose={() => setSelectedSpan(null)}
            />
        </div>
    );
}
