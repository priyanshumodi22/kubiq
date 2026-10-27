import { useCallback, useEffect, useRef, useState } from 'react';
import { AppDialog, type DialogOptions } from '../components/AppDialog';

/** All app confirmations and password prompts use kubiq's shared dialog. */
export function useAppDialog() {
  const [options, setOptions] = useState<DialogOptions | null>(null);
  const resolver = useRef<((answer: string | null) => void) | null>(null);
  const settle = useCallback((answer: string | null) => {
    resolver.current?.(answer);
    resolver.current = null;
    setOptions(null);
  }, []);
  useEffect(() => () => { resolver.current?.(null); resolver.current = null; }, []);
  const open = (next: DialogOptions) => new Promise<string | null>(resolve => {
    resolver.current?.(null);
    resolver.current = resolve;
    setOptions(next);
  });
  return {
    confirm: async (next: DialogOptions) => (await open(next)) !== null,
    password: (next: DialogOptions) => open({ ...next, password: true }),
    dialog: options ? <AppDialog options={options} onAnswer={settle} /> : null,
  };
}
