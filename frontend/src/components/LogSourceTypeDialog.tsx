import { useEffect, useRef } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

export function LogSourceTypeDialog({ kubernetes, onVM, onKubernetes, onClose }: Readonly<{ kubernetes: boolean; onVM: () => void; onKubernetes: () => void; onClose: () => void }>) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus(); };
  }, []);
  return <dialog ref={dialog} aria-label="Configure Log Sources" onCancel={event => { event.preventDefault(); onClose(); }} className="fixed inset-0 m-0 h-screen max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-inherit">
    <ConfirmDialog isOpen type="info" title="Configure Log Sources" message="Choose the type of source to stream." confirmText="VM service logs" onConfirm={onVM} onClose={onClose}>
      {kubernetes && <button type="button" onClick={onKubernetes} className="mb-5 w-full rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm text-primary">Kubernetes logs</button>}
    </ConfirmDialog>
  </dialog>;
}
