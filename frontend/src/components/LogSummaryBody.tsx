import { AiStatusOrb } from './AiStatusOrb';
import { AiSummaryContent } from './AiSummaryContent';

export function LogSummaryBody({ summarizing, summary }: Readonly<{ summarizing: boolean; summary: string | null }>) {
    if (summarizing) return (
        <div className="flex flex-col items-center justify-center py-12">
            <AiStatusOrb activity="searching" size={64} />
            <p className="mt-4 text-sm font-medium text-white">Thinking through your logs…</p>
            <p className="mt-1 text-xs text-gray-500">Building a concise incident summary.</p>
        </div>
    );
    if (summary) return <AiSummaryContent summary={summary} />;
    return <p className="text-red-400">Failed to generate summary.</p>;
}
