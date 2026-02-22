import { useMemo } from 'react';
import { ISpan } from '../hooks/useTrace';
import { Clock, Server } from 'lucide-react';

interface TraceWaterfallProps {
    spans: ISpan[];
}

interface SpanNode extends ISpan {
    children: SpanNode[];
    depth: number;
}

export default function TraceWaterfall({ spans }: TraceWaterfallProps) {
    // 1. Build the Tree
    const { rootSpans, minStartTime, totalDurationMs } = useMemo(() => {
        if (!spans || spans.length === 0) {
            return { rootSpans: [], minStartTime: 0, maxEndTime: 0, totalDurationMs: 0 };
        }

        let minStart = spans.length > 0 ? spans[0].startTimeUnixNano : 0;
        let maxEnd = spans.length > 0 ? spans[0].endTimeUnixNano : 0;

        const spanMap = new Map<string, SpanNode>();
        const roots: SpanNode[] = [];

        // First pass: create nodes and find absolute start/end times
        spans.forEach(span => {
            spanMap.set(span.spanId, { ...span, children: [], depth: 0 });
            if (span.startTimeUnixNano < minStart) minStart = span.startTimeUnixNano;
            if (span.endTimeUnixNano > maxEnd) maxEnd = span.endTimeUnixNano;
        });

        // Second pass: link children to parents
        spanMap.forEach(node => {
            if (node.parentSpanId && spanMap.has(node.parentSpanId)) {
                const parent = spanMap.get(node.parentSpanId)!;
                parent.children.push(node);
            } else {
                roots.push(node);
            }
        });

        // Third pass: calculate depth for indentation
        const assignDepth = (node: SpanNode, currentDepth: number) => {
            node.depth = currentDepth;
            // Sort children by start time so the waterfall flows naturally top-to-bottom
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
            totalDurationMs: totalMs > 0 ? totalMs : 1 // prevent division by zero
        };
    }, [spans]);

    if (rootSpans.length === 0) return null;

    // Helper to render the recursive tree
    const renderNode = (node: SpanNode) => {
        // Calculate percentages for the CSS width and margin-left
        const startOffsetMs = (node.startTimeUnixNano - minStartTime) / 1000000;
        const leftPercent = (startOffsetMs / totalDurationMs) * 100;

        // Ensure minimum width of 2px so extremely fast spans are still visible, and max 100% to prevent overflow
        let widthPercent = (node.durationMs / totalDurationMs) * 100;
        if (widthPercent < 0.5) widthPercent = 0.5;
        if (widthPercent > 100) widthPercent = 100;

        const isError = node.statusCode === 2; // OTel Error Code

        return (
            <div key={node.spanId} className="flex flex-col mb-1 group">
                <div className="flex items-center text-sm py-1 hover:bg-white/5 rounded px-2 transition-colors relative">

                    {/* Left Column: Span Metadata (Name & Service) */}
                    <div className="w-1/3 flex-shrink-0 flex items-center pr-4 overflow-hidden" style={{ paddingLeft: `${node.depth * 16}px` }}>
                        <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isError ? 'bg-red-500' : 'bg-primary'}`}></span>
                                <span className="font-medium text-white truncate text-xs sm:text-sm">{node.name}</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-gray-500 ml-3.5 mt-0.5 min-w-0">
                                <Server className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{node.serviceName}</span>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: The Gantt Bar */}
                    <div className="w-2/3 flex-grow relative h-6 border-l border-gray-800 flex items-center">
                        <div
                            className={`absolute h-4 rounded-sm ${isError ? 'bg-red-500/80 border border-red-400' : 'bg-primary/80 border border-primary/50'}`}
                            style={{
                                left: `${leftPercent}%`,
                                // Important: We cap widthPercent + leftPercent to 100% so it never overflows
                                width: `${Math.min(widthPercent, 100 - leftPercent)}%`,
                                minWidth: '4px'
                            }}
                        />

                        {/* 
                          * Duration Text placed OUTSIDE the colored bar for always-on visibility.
                          * Position it immediately to the right of the bar, unless it exceeds 80% width, 
                          * then safely tuck it inside or to the left.
                          */}
                        <span
                            className={`absolute text-gray-300 font-mono text-xs z-10 px-1.5`}
                            style={{
                                left: leftPercent + widthPercent > 85 ? 'auto' : `calc(${leftPercent + widthPercent}% + 4px)`,
                                right: leftPercent + widthPercent > 85 ? `calc(${100 - leftPercent}% + 4px)` : 'auto',
                            }}
                        >
                            {node.durationMs.toFixed(2)}ms
                        </span>
                    </div>
                </div>

                {/* Render Children */}
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
                <div className="text-sm font-mono text-gray-400">
                    Total Duration: <span className="text-white font-bold">{totalDurationMs.toFixed(2)}ms</span>
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
        </div>
    );
}
