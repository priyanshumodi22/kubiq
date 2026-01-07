import { useState, useRef, useEffect } from 'react';
import { Check } from 'lucide-react';

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

export default function Combobox({
  value,
  onChange,
  options,
  placeholder,
  className = '',
}: ComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync search term with value prop when it changes externally
  useEffect(() => {
    setSearchTerm(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // Reset search term to current value if closed without selection
        if (options.includes(searchTerm) || !searchTerm) {
             // keep as is
        } else {
            // Optional: enforce selection? For now, let it be free text as per "Postman" (headers can be anything)
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [wrapperRef, searchTerm, options]);

  const filteredOptions = options.filter((option) =>
    option.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (option: string) => {
    onChange(option);
    setSearchTerm(option);
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            onChange(e.target.value);
            setIsOpen(true);
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
        <div className="absolute z-50 w-full mt-1 bg-bg-elevated border border-gray-700 rounded-md shadow-xl max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
          {filteredOptions.map((option) => (
            <button
              key={option}
              onClick={() => handleSelect(option)}
              className="w-full text-left px-3 py-1.5 text-xs text-text hover:bg-primary/20 hover:text-primary transition-colors flex items-center justify-between"
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
