import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { X, CheckCircle, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { ToastContext } from './ToastContext';
import type { ToastContextType, ToastType } from './ToastContext';

interface Toast { id: number; message: string; type: ToastType }
function toastIcon(type: ToastType) {
  switch (type) {
    case 'success': return <CheckCircle className="w-5 h-5 text-green-500" />;
    case 'error': return <AlertCircle className="w-5 h-5 text-red-500" />;
    case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
    default: return <Info className="w-5 h-5 text-blue-500" />;
  }
}

export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const addToast = useCallback((message: string, type: ToastType) => {
    const id = ++nextId.current;
    setToasts(previous => [...previous, { id, message, type }]);
    const timer = setTimeout(() => {
      timers.current.delete(id);
      setToasts(previous => previous.filter(toast => toast.id !== id));
    }, 3000);
    timers.current.set(id, timer);
  }, []);
  const value = useMemo<ToastContextType>(() => ({
    addToast,
    success: message => addToast(message, 'success'),
    error: message => addToast(message, 'error'),
    info: message => addToast(message, 'info'),
    warning: message => addToast(message, 'warning'),
  }), [addToast]);

  useEffect(() => {
    const pending = timers.current;
    return () => { pending.forEach(clearTimeout); pending.clear(); };
  }, []);
  useEffect(() => {
    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; type?: ToastType }>).detail;
      if (detail?.message) addToast(detail.message, detail.type || 'warning');
    };
    globalThis.addEventListener('kubiq:toast', handleToast);
    return () => globalThis.removeEventListener('kubiq:toast', handleToast);
  }, [addToast]);
  const removeToast = (id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts(previous => previous.filter(toast => toast.id !== id));
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-100 flex flex-col gap-2">
        {toasts.map(toast => (
          <div key={toast.id} role={toast.type === 'error' ? 'alert' : 'status'}
            className="flex items-center gap-3 p-4 bg-gray-800 border border-gray-700 shadow-xl rounded-lg text-white min-w-[300px] animate-slide-in-right">
            {toastIcon(toast.type)}
            <p className="grow text-sm">{toast.message}</p>
            <button type="button" aria-label={`Dismiss ${toast.message}`} onClick={() => removeToast(toast.id)}
              className="text-gray-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
