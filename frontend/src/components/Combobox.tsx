import { useState, useRef, useEffect, useId } from 'react';
import type { KeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import { listboxIndex } from './listboxNavigation';

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  id?: string;
  label?: string;
}

export default function Combobox({
  value,
  onChange,
  options,
  placeholder,
  className = '',
  id,
  label,
}: Readonly<ComboboxProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value);
  const [active, setActive] = useState(-1);
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-options`;
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync search term with value prop when it changes externally
  useEffect(() => {
    setSearchTerm(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // Header values intentionally support free text; closing preserves it.
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter((option) =>
    option.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const activeOptionId = isOpen && filteredOptions[active] !== undefined ? `${listId}-${encodeURIComponent(filteredOptions[active])}` : undefined;

  useEffect(() => {
    if (activeOptionId) document.getElementById(activeOptionId)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeOptionId]);

  const handleSelect = (option: string) => {
    onChange(option);
    setSearchTerm(option);
    inputRef.current?.focus();
    setIsOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Home/End remain native caret operations in an editable combobox.
    const current = isOpen ? active : -1;
    const next = ['ArrowDown', 'ArrowUp'].includes(event.key)
      ? listboxIndex(event.key, current, filteredOptions.length) : undefined;
    if (next !== undefined) {
      event.preventDefault();
      setActive(next);
      setIsOpen(true);
    } else if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
    } else if (event.key === 'Enter' && isOpen && filteredOptions[active] !== undefined) {
      event.preventDefault();
      handleSelect(filteredOptions[active]);
    }
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-label={label ?? placeholder ?? 'Value'}
          aria-autocomplete="list"
          aria-expanded={isOpen && filteredOptions.length > 0}
          aria-controls={isOpen && filteredOptions.length > 0 ? listId : undefined}
          aria-activedescendant={activeOptionId}
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            onChange(e.target.value);
            setIsOpen(true);
            setActive(-1);
          }}
          onKeyDown={handleKeyDown}
          onBlur={event => {
            if (!wrapperRef.current?.contains(event.relatedTarget as Node | null)) setIsOpen(false);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full px-3 py-1.5 text-xs bg-bg-surface rounded border border-gray-700 focus:border-primary focus:outline-none pr-8"
        />
        {/* Optional: Add chevron to indicate dropdown availability */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
           {/* Only show if not typing? Or always? Postman just shows text. Let's start clean. */}
        </div>
      </div>

      {isOpen && filteredOptions.length > 0 && (
        <div id={listId} role="listbox" aria-label={label ?? placeholder ?? 'Suggestions'} className="absolute z-50 w-full mt-1 bg-bg-elevated border border-gray-700 rounded-md shadow-xl max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
          {filteredOptions.map((option) => (
            <button
              key={option}
              id={`${listId}-${encodeURIComponent(option)}`}
              type="button"
              role="option"
              aria-selected={value === option}
              tabIndex={-1}
              onBlur={event => {
                if (!wrapperRef.current?.contains(event.relatedTarget as Node | null)) setIsOpen(false);
              }}
              onClick={() => handleSelect(option)}
              className={`w-full text-left px-3 py-1.5 text-xs text-text hover:bg-primary/20 hover:text-primary transition-colors flex items-center justify-between ${filteredOptions[active] === option ? 'outline outline-1 outline-primary' : ''}`}
            >
              <span>{option}</span>
              {value === option && <Check className="w-3 h-3 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
