import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, Code2 } from 'lucide-react';
import { APM_GUIDE, instrumentationBlocks, instrumentationMarkdown } from '../utils/apmInstrumentation';
import type { InstrumentationBlock } from '../utils/apmInstrumentation';
import { useToast } from '../contexts/ToastContext';

export interface ApmInstrumentationModalProps { isOpen: boolean; onClose: () => void }

function GuideBlock({ block, copied, copy }: Readonly<{ block: InstrumentationBlock; copied: boolean; copy: () => void }>) {
    return <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-gray-200">{block.title}</h4>
            <button type="button" onClick={copy} aria-label={'Copy ' + block.title} className="inline-flex items-center gap-1.5 rounded border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary focus-visible:outline-2 focus-visible:outline-primary">
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? 'Copied' : 'Copy'}
            </button>
        </div>
        {block.filename && <p className="text-xs text-gray-400">File: <code>{block.filename}</code></p>}
        <pre className="max-w-full overflow-x-auto rounded-xl border border-gray-800 bg-[#181818] p-4 text-xs leading-relaxed text-gray-200"><code>{block.code}</code></pre>
    </section>;
}

export function ApmInstrumentationModal({ isOpen, onClose }: Readonly<ApmInstrumentationModalProps>) {
    const [current, setCurrent] = useState(APM_GUIDE.runtimes[0]);
    const [copied, setCopied] = useState<string | null>(null);
    const { error } = useToast();
    const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dialogRef = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        if (!isOpen || !dialogRef.current) return;
        const dialog = dialogRef.current;
        const trigger = document.activeElement;
        dialog.showModal();
        return () => {
            if (dialog.open) dialog.close();
            if (trigger instanceof HTMLElement) trigger.focus();
            if (copyTimer.current !== null) clearTimeout(copyTimer.current);
        };
    }, [isOpen]);
    const copy = async (id: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(id);
            if (copyTimer.current !== null) clearTimeout(copyTimer.current);
            copyTimer.current = setTimeout(() => setCopied(null), 2000);
        } catch { error('Unable to copy the instrumentation guide. Copy the displayed configuration manually.'); }
    };
    if (!isOpen) return null;
    return createPortal(
        <dialog ref={dialogRef} aria-modal="true" aria-labelledby="apm-guide-title"
            onCancel={event => { event.preventDefault(); onClose(); }}
            onClick={event => {
                if (event.target !== event.currentTarget) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
            }}
            className="fixed inset-0 m-auto flex max-h-[85vh] w-[calc(100%_-_2rem)] max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-800 bg-[#111111] p-0 text-inherit shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-md">
            <header className="flex items-center justify-between gap-3 border-b border-gray-800 bg-[#161616] p-5">
                <div className="flex items-center gap-3"><Code2 className="size-6 shrink-0 text-primary" /><div>
                    <h3 id="apm-guide-title" className="text-base font-bold text-white">Instrument New Service</h3>
                    <p className="text-xs text-gray-400">The same tested setup as the kubiq documentation.</p>
                </div></div>
                <button type="button" aria-label="Close instrumentation guide" onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:text-white focus-visible:outline-2 focus-visible:outline-primary"><X className="size-5" /></button>
            </header>
            <nav aria-label="Instrumentation language" className="flex shrink-0 gap-2 overflow-x-auto border-b border-gray-800 bg-[#141414] px-5 pt-3">
                {APM_GUIDE.runtimes.map(runtime => <button key={runtime.id} type="button" aria-pressed={current.id === runtime.id}
                    onClick={() => { setCurrent(runtime); setCopied(null); }}
                    className={'whitespace-nowrap rounded-t-lg border-b-2 px-4 py-2 text-xs font-bold focus-visible:outline-2 focus-visible:outline-primary ' + (current.id === runtime.id ? 'border-primary bg-primary/5 text-primary' : 'border-transparent text-gray-400 hover:text-gray-200')}>{runtime.label}</button>)}
            </nav>
            <div className="custom-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto p-5 text-sm">
                <p className="text-gray-300">{current.description}</p>
                <p className="text-xs leading-relaxed text-gray-400">{APM_GUIDE.endpointNotes}</p>
                <p className="text-xs leading-relaxed text-gray-400">{APM_GUIDE.shellNotes}</p>
                {current.collector && <p className="text-xs leading-relaxed text-gray-400">{APM_GUIDE.collector.description}</p>}
                {instrumentationBlocks(current).map(block => <GuideBlock key={block.id} block={block} copied={copied === block.id} copy={() => { void copy(block.id, block.code); }} />)}
                <section className="space-y-2 text-gray-300"><h4 className="font-semibold">Verify real delivery</h4><p className="text-xs leading-relaxed">{APM_GUIDE.verification}</p></section>
            </div>
            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-800 bg-[#161616] p-4 text-xs">
                <a href={'https://kubiq.priyanshumodi.in/docs/apm#' + current.anchor} target="_blank" rel="noreferrer" className="text-primary underline">Read {current.label} documentation</a>
                <button type="button" onClick={() => { void copy('guide', instrumentationMarkdown(current)); }} className="rounded-lg bg-primary/10 px-3 py-2 text-primary">{copied === 'guide' ? 'Copied guide' : 'Copy complete guide'}</button>
                <button type="button" onClick={onClose} className="rounded-xl bg-gray-800 px-5 py-2 font-medium text-white">Close</button>
            </footer>
        </dialog>, document.body);
}
