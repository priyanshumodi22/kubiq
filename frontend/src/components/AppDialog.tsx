import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

export interface DialogOptions { title: string; message: string; confirmText?: string; password?: boolean }
export function AppDialog({ options, onAnswer }: Readonly<{ options: DialogOptions; onAnswer: (answer: string | null) => void }>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const trigger = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => {
      if (element?.open) element.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);
  const accept = () => {
    if (options.password && password.length < 12) return setError('Password must be at least 12 characters.');
    onAnswer(options.password ? password : 'confirmed');
  };
  return <dialog ref={dialog} aria-label={options.title} onCancel={event => { event.preventDefault(); onAnswer(null); }} className="fixed inset-0 m-0 h-screen max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-inherit">
    <form noValidate onSubmit={event => { event.preventDefault(); accept(); }}>
      <ConfirmDialog isOpen title={options.title} message={options.message} confirmText={options.confirmText} type={options.password ? 'info' : 'danger'} onClose={() => onAnswer(null)} onConfirm={accept}>
        {options.password && <div className="mb-5 text-left"><label className="block text-sm text-text-dim">Temporary password<input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-bg p-3 text-text" /></label>{error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}</div>}
      </ConfirmDialog>
    </form>
  </dialog>;
}

