import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export type CustomSelectOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
};

type CustomSelectProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: CustomSelectOption<T>[];
  label: string;
  disabled?: boolean;
  compact?: boolean;
  placement?: 'top' | 'bottom';
};

export function CustomSelect<T extends string>({
  value,
  onChange,
  options,
  label,
  disabled = false,
  compact = false,
  placement = 'bottom',
}: Readonly<CustomSelectProps<T>>) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
        className={`flex w-full items-center justify-between rounded-xl border border-white/10 bg-bg-surface text-left text-text transition hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 ${compact ? 'px-2.5 py-1.5' : 'px-3 py-3'}`}
      >
        <span className={compact ? 'text-xs font-medium' : 'text-sm font-medium'}>
          {selected?.label || 'Select an option'}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-text-dim transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={label}
          className={`absolute z-40 w-full overflow-hidden rounded-xl border border-white/10 bg-bg-surface p-1 shadow-2xl shadow-black/40 ${placement === 'top' ? 'bottom-full mb-2' : 'mt-2'}`}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-lg px-3 text-left transition ${compact ? 'py-2 text-xs' : 'py-2.5 text-sm'} ${option.value === value ? 'bg-primary/15 text-white' : 'text-text-dim hover:bg-white/5 hover:text-text'}`}
            >
              <span>{option.label}</span>
              {option.value === value && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
