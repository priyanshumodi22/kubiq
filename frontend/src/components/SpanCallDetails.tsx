import type { ISpan } from '../hooks/useTrace';
import { spanDetailGroups, spanKindLabel, spanTimestamp, type SpanDetailField } from './spanDetailGroups';
function DetailGroup({ title, fields }: Readonly<{ title: string; fields: SpanDetailField[] }>) {
    if (!fields.length) return null;
    return <section className="mb-5" aria-label={title}><h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-text-dim">{title}</h3><dl className="rounded-xl border border-white/10 bg-bg-card px-4">{fields.map(item => <div key={item.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 border-b border-white/5 py-3 last:border-0"><dt className="text-xs text-text-dim">{item.label}</dt><dd className="min-w-0 break-words font-mono text-xs text-text [overflow-wrap:anywhere]">{item.value}</dd></div>)}</dl></section>;
}
export function SpanCallDetails({ span }: Readonly<{ span: ISpan }>) {
    const groups = spanDetailGroups(span);
    return <>
        <DetailGroup title="Call details" fields={[{ label: 'Service', value: span.serviceName }, { label: 'Operation', value: span.name }, { label: 'Span type', value: spanKindLabel(span.kind) }, { label: 'Started (UTC)', value: spanTimestamp(span.startTimeUnixNano) }, { label: 'Finished (UTC)', value: spanTimestamp(span.endTimeUnixNano) }]} />
        <DetailGroup title="Database target" fields={groups.database} />
        <DetailGroup title="HTTP request" fields={groups.http} />
        <DetailGroup title="Code and errors" fields={groups.source} />
        {groups.repository && <p className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-text-dim">Repository operation duration includes application work; it is not a database execution plan. Query values and credentials are intentionally omitted.</p>}
    </>;
}
