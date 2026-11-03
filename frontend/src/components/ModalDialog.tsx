import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

const focusableSelector = 'button, a[href], input, select, textarea, [tabindex]';
const restorationTargets = new WeakMap<HTMLDialogElement, HTMLElement[]>();
function focusableElements(dialog: HTMLDialogElement) {
  return [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(element => {
    if (element.tabIndex < 0 || element.matches(':disabled') || element.closest('[hidden], [inert]')) return false;
    return typeof element.checkVisibility === 'function'
      ? element.checkVisibility({ checkVisibilityCSS: true })
      : getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden';
  });
}

function containDialogFocus(event: KeyboardEvent, dialog: HTMLDialogElement) {
  if (event.defaultPrevented || event.key !== 'Tab') return;
  const controls = focusableElements(dialog);
  const first = controls[0];
  const last = controls.at(-1);
  if (!first) { event.preventDefault(); dialog.focus(); return; }
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
    event.preventDefault(); last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first.focus();
  }
}

/** kubiq visuals remain in the caller; the native shell owns modality and focus. */
export function ModalDialog({ label, onClose, busy = false, children, className }: Readonly<{
  label: string; onClose: () => void; busy?: boolean; children: ReactNode; className?: string;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Capture before children mount/autofocus, rather than accidentally restoring into the dialog.
  const [openers] = useState(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return [];
    const parentDialog = active.closest('dialog');
    return [active, ...(parentDialog ? restorationTargets.get(parentDialog) ?? [] : [])];
  });
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    restorationTargets.set(dialog, openers);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    const initial = dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]') ?? focusableElements(dialog)[0];
    (initial ?? dialog).focus({ preventScroll: true });
    return () => {
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      restorationTargets.delete(dialog);
      openers.find(opener => opener.isConnected)?.focus({ preventScroll: true });
    };
  }, [openers]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const keyDown = (event: KeyboardEvent) => containDialogFocus(event, dialog);
    const click = (event: MouseEvent) => {
      const target = event.target;
      if (!busy && target instanceof HTMLElement && target.closest('dialog') === dialog
        && (target === dialog || target.dataset.dialogBackdrop !== undefined)) onClose();
    };
    dialog.addEventListener('keydown', keyDown);
    dialog.addEventListener('click', click);
    return () => {
      dialog.removeEventListener('keydown', keyDown);
      dialog.removeEventListener('click', click);
    };
  }, [busy, onClose]);

  return <dialog ref={dialogRef} aria-label={label} aria-modal="true" tabIndex={-1}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); }}
    className={className ?? 'fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto border-0 bg-transparent p-0 text-inherit backdrop:bg-transparent'}>
    {children}
  </dialog>;
}
