import type { ISpan } from '../hooks/useTrace';
function formatStatement(value: string): string {
    try { return JSON.stringify(JSON.parse(value), null, 2); }
    catch { return value; }
}
export function DatabaseStatement({ span }: Readonly<{ span: ISpan }>) {
    const attributes = span.attributes || {};
    if (!attributes['db.system'] && !attributes['db.system.name']) return null;
    const value = attributes['db.query.text'] ?? attributes['db.statement'];
    const recorded = typeof value === 'string' && value.length > 0;
    return <section className="mb-5" aria-label="Database statement or command">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-text-dim">Database statement / command</h3>
        {recorded ? <>
            {value.includes('[REDACTED') && <p className="mb-2 text-xs text-amber-400">Passwords or credentials redacted</p>}
            {value.includes('"truncated":true') && <p className="mb-2 text-xs text-amber-400">Capture size limit reached; showing a truncated preview</p>}
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-xs leading-relaxed text-text [overflow-wrap:anywhere]">{formatStatement(value)}</pre>
        </> : <p className="rounded-xl border border-dashed border-white/10 p-4 text-xs leading-relaxed text-text-dim">No query text was recorded for this span. Repository spans provide context; select their child database command for statement details.</p>}
    </section>;
}
