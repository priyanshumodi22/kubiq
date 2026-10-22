import { createContext, useContext } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';
export interface ToastContextType {
  addToast: (message: string, type: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}
export const ToastContext = createContext<ToastContextType | undefined>(undefined);
export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) throw new Error('useToast must be used within a ToastProvider');
  return context;
}
