import { useState } from 'react';
import { ModalDialog } from './ModalDialog';
import { ConfirmDialog } from './ConfirmDialog';

export interface DialogOptions { title: string; message: string; confirmText?: string; password?: boolean }
export function AppDialog({ options, onAnswer }: Readonly<{ options: DialogOptions; onAnswer: (answer: string | null) => void }>) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const accept = () => {
    if (options.password && password.length < 12) return setError('Password must be at least 12 characters.');
    onAnswer(options.password ? password : 'confirmed');
  };
  return <ModalDialog label={options.title} onClose={() => onAnswer(null)}>
    <form noValidate onSubmit={event => { event.preventDefault(); accept(); }}>
      <ConfirmDialog contained isOpen title={options.title} message={options.message} confirmText={options.confirmText} type={options.password ? 'info' : 'danger'} onClose={() => onAnswer(null)} onConfirm={accept}>
        {options.password && <div className="mb-5 text-left"><label className="block text-sm text-text-dim">Temporary password<input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-bg p-3 text-text" /></label>{error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}</div>}
      </ConfirmDialog>
    </form>
  </ModalDialog>;
}

