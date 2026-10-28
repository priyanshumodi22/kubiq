import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { listboxIndex } from './listboxNavigation';

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
  const [active, setActive] = useState(-1);
  const listId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((option) => option.value === value) || options[0];
  const activeOptionId = open && !disabled && options[active] ? `${listId}-${encodeURIComponent(options[active].value)}` : undefined;

  useEffect(() => {
    if (activeOptionId) document.getElementById(activeOptionId)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeOptionId]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const select = (next: T) => {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = listboxIndex(event.key, open ? active : options.findIndex(option => option.value === value), options.length);
    if (next !== undefined) {
      event.preventDefault();
      setActive(next);
      setOpen(true);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (open && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      const option = options[active];
      if (option) select(option.value);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open && !disabled}
        aria-controls={open && !disabled ? listId : undefined}
        aria-activedescendant={activeOptionId}
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          setActive(Math.max(0, options.findIndex(option => option.value === value)));
          setOpen(current => !current);
        }}
        onKeyDown={handleKeyDown}
        onBlur={event => {
          if (!wrapperRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
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
      {open && !disabled && (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className={`absolute z-40 w-full max-h-56 overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-bg-surface p-1 shadow-2xl shadow-black/40 ${placement === 'top' ? 'bottom-full mb-2' : 'mt-2'}`}
        >
          {options.map((option) => (
            <button
              key={option.value}
              id={`${listId}-${encodeURIComponent(option.value)}`}
              type="button"
              role="option"
              tabIndex={-1}
              onBlur={event => {
                if (!wrapperRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
              }}
              aria-selected={option.value === value}
              onClick={() => select(option.value)}
              className={`flex w-full items-center justify-between rounded-lg px-3 text-left transition ${compact ? 'py-2 text-xs' : 'py-2.5 text-sm'} ${option.value === value ? 'bg-primary/15 text-white' : 'text-text-dim hover:bg-white/5 hover:text-text'} ${options[active]?.value === option.value ? 'outline outline-1 outline-primary' : ''}`}
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
