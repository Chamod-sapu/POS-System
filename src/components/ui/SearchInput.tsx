import React, { useState, useEffect, useRef, forwardRef } from 'react';
import { Search, X } from 'lucide-react';

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value?: string;
  onChange?: (val: string) => void;
  onDebounce?: (val: string) => void;
  debounceMs?: number;
  enableShortcut?: boolean;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      value: controlledValue,
      onChange,
      onDebounce,
      debounceMs = 300,
      enableShortcut = true,
      placeholder = 'Search products, bills or customers...',
      className = '',
      ...props
    },
    forwardedRef
  ) => {
    const [localValue, setLocalValue] = useState<string>(controlledValue ?? '');
    const innerRef = useRef<HTMLInputElement>(null);
    const inputRef = (forwardedRef as React.RefObject<HTMLInputElement>) || innerRef;

    // Keep local value in sync with controlled value
    useEffect(() => {
      if (controlledValue !== undefined) {
        setLocalValue(controlledValue);
      }
    }, [controlledValue]);

    // Debounced callback
    useEffect(() => {
      if (!onDebounce) return;
      const handler = setTimeout(() => {
        onDebounce(localValue);
      }, debounceMs);

      return () => clearTimeout(handler);
    }, [localValue, onDebounce, debounceMs]);

    // Keyboard shortcut to focus search input (e.g. press '/' anywhere outside an input)
    useEffect(() => {
      if (!enableShortcut) return;

      const handleGlobalKeyDown = (e: KeyboardEvent) => {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
          return;
        }

        if (e.key === '/' || (e.ctrlKey && e.key.toLowerCase() === 'k')) {
          e.preventDefault();
          inputRef.current?.focus();
        }
      };

      window.addEventListener('keydown', handleGlobalKeyDown);
      return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [enableShortcut, inputRef]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setLocalValue(val);
      onChange?.(val);
    };

    const handleClear = () => {
      setLocalValue('');
      onChange?.('');
      onDebounce?.('');
      inputRef.current?.focus();
    };

    return (
      <div className={`relative w-full ${className}`}>
        {/* Left Search Icon */}
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
          <Search className="w-4 h-4" />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={localValue}
          onChange={handleChange}
          placeholder={placeholder}
          className="block w-full min-h-[44px] pl-10 pr-16 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-subtle"
          {...props}
        />

        {/* Right Section: Clear Button & Shortcut Badge */}
        <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center space-x-1">
          {localValue ? (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear search"
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-subtle cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : enableShortcut ? (
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-subtle select-none">
              /
            </kbd>
          ) : null}
        </div>
      </div>
    );
  }
);

SearchInput.displayName = 'SearchInput';
