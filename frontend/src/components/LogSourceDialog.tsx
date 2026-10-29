import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

/** Shared log configuration shell, matching the existing VM configuration form. */
export function LogSourceDialog({ title, description, busy = false, onClose, children, actions }: Readonly<{ title: string; description: string; busy?: boolean; onClose: () => void; children?: ReactNode; actions: ReactNode }>) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus(); };
  }, []);
  return <dialog ref={dialog} aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-transparent p-4 text-text backdrop:bg-black/60 backdrop:backdrop-blur-sm">
    <div className="flex h-full min-h-0 items-center justify-center">
      <div className="flex max-h-full min-h-0 w-full max-w-lg flex-col rounded-2xl border border-white/10 bg-bg-surface shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 p-4 pb-3 sm:p-6 sm:pb-4">
          <div><h2 className="text-xl font-bold text-text text-balance">{title}</h2><p className="mt-2 text-sm text-text-dim text-pretty">{description}</p></div>
          <button type="button" aria-label={`Close ${title}`} disabled={busy} onClick={onClose} className="rounded-lg p-1 text-text-dim hover:bg-white/5 hover:text-text focus-visible:outline focus-visible:outline-primary disabled:opacity-50"><X className="size-5" /></button>
        </header>
        {children && <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6 sm:pb-5">{children}</div>}
        <footer className="mx-4 flex shrink-0 gap-3 sm:mx-6 border-t border-white/10 py-5">{actions}</footer>
      </div>
    </div>
  </dialog>;
}
export const logSourceSecondary = 'flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-text-dim hover:bg-white/5 focus-visible:outline focus-visible:outline-primary disabled:opacity-50';
export const logSourcePrimary = 'flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 focus-visible:outline focus-visible:outline-primary disabled:opacity-50';
