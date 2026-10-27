import type { ToastType } from '../contexts/ToastContext';
export function notify(message: string, type: ToastType = 'error'): void {
  globalThis.dispatchEvent(new CustomEvent('kubiq:toast', { detail: { message, type } }));
}
