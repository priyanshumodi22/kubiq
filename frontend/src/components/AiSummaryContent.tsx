import ReactMarkdown, { type Components } from 'react-markdown';

const markdownComponents: Components = {
    h1: ({ children }) => (
        <h4 className="mb-4 flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-white">
            {children}
        </h4>
    ),
    h2: ({ children }) => (
        <h5 className="mb-3 mt-6 text-sm font-semibold text-slate-100 first:mt-0">
            {children}
        </h5>
    ),
    h3: ({ children }) => (
        <h6 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-200 first:mt-0">
            {children}
        </h6>
    ),
    p: ({ children }) => <p className="my-3 text-[13px] leading-6 text-slate-300 first:mt-0 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="my-4 space-y-2 pl-5 text-[13px] leading-5 text-slate-200 marker:text-sky-400">{children}</ul>,
    ol: ({ children }) => <ol className="my-4 space-y-2 pl-5 text-[13px] leading-5 text-slate-200 marker:text-sky-400">{children}</ol>,
    li: ({ children }) => <li className="pl-1">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold text-slate-100">{children}</strong>,
    em: ({ children }) => <em className="text-slate-300">{children}</em>,
    code: ({ children, className }) => (
        <code className={className ? "block my-3 overflow-x-auto rounded-lg border border-slate-700/80 bg-[#090c12] px-3 py-2 font-mono text-xs leading-6 text-sky-200" : "rounded border border-sky-400/20 bg-sky-400/[0.08] px-1.5 py-0.5 font-mono text-[0.85em] text-sky-200"}>
            {children}
        </code>
    ),
    pre: ({ children }) => <pre className="my-4 overflow-x-auto rounded-lg border border-slate-700/80 bg-[#090c12] p-3">{children}</pre>,
    blockquote: ({ children }) => <blockquote className="my-4 border-l border-sky-300/60 pl-3 text-slate-300">{children}</blockquote>,
    hr: () => <hr className="my-5 border-slate-700/80" />,
};

export function AiSummaryContent({ summary }: { summary: string }) {
    return (
        <section className="rounded-2xl border border-slate-700/80 bg-[#11151d] px-5 py-5 shadow-[0_18px_42px_rgba(0,0,0,0.2)] sm:px-6">
            <ReactMarkdown components={markdownComponents}>{summary}</ReactMarkdown>
        </section>
    );
}
