import React, { useState, useEffect, forwardRef, useId } from 'react';
import { toCents } from '../../lib/money';

export interface MoneyInputProps {
  valueCents: bigint | null;
  onChange: (cents: bigint) => void;
  label?: string;
  error?: string;
  helperText?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  id?: string;
  name?: string;
  className?: string;
}

/**
 * Converts integer cents to a formatted rupees string (e.g., 125050n -> "1250.50")
 * using purely integer BigInt arithmetic.
 */
function centsToRupeesString(cents: bigint | null): string {
  if (cents === null) return '';
  const isNegative = cents < 0n;
  const abs = isNegative ? -cents : cents;
  const rupees = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${rupees.toString()}.${fraction}`;
}

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  (
    {
      valueCents,
      onChange,
      label,
      error,
      helperText,
      placeholder = '0.00',
      disabled = false,
      required = false,
      autoFocus = false,
      id: customId,
      name,
      className = '',
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = customId || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    // Local string state while the user is actively typing
    const [displayValue, setDisplayValue] = useState<string>(() =>
      centsToRupeesString(valueCents)
    );
    const [isFocused, setIsFocused] = useState<boolean>(false);

    // Sync external valueCents if input is not focused
    useEffect(() => {
      if (!isFocused) {
        setDisplayValue(centsToRupeesString(valueCents));
      }
    }, [valueCents, isFocused]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/,/g, '').trim();

      // Allow empty input
      if (raw === '') {
        setDisplayValue('');
        onChange(0n);
        return;
      }

      // Restrict input to numbers with at most 2 decimal digits
      if (!/^\d*(?:\.\d{0,2})?$/.test(raw)) {
        return;
      }

      setDisplayValue(raw);

      try {
        const cents = toCents(raw);
        onChange(cents);
      } catch {
        // In-progress typing (e.g. "12.")
      }
    };

    const handleBlur = () => {
      setIsFocused(false);
      if (displayValue === '' || displayValue === '.') {
        setDisplayValue('');
        onChange(0n);
      } else {
        try {
          const cents = toCents(displayValue);
          setDisplayValue(centsToRupeesString(cents));
          onChange(cents);
        } catch {
          setDisplayValue(centsToRupeesString(valueCents));
        }
      }
    };

    const handleFocus = () => {
      setIsFocused(true);
    };

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5"
          >
            {label}
            {required && <span className="text-rose-500 ml-1">*</span>}
          </label>
        )}

        <div className="relative rounded-lg shadow-subtle">
          {/* LKR Currency Prefix Badge */}
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 select-none">Rs.</span>
          </div>

          <input
            ref={ref}
            id={inputId}
            name={name}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder={placeholder}
            disabled={disabled}
            autoFocus={autoFocus}
            value={displayValue}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? errorId : helperText ? helperId : undefined}
            className={`
              block w-full min-h-[44px] pl-11 pr-4 py-2.5 rounded-lg border text-base font-mono font-medium transition-subtle tabular-nums
              text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 placeholder-slate-400 dark:placeholder-slate-500
              outline-none focus:ring-2 focus:ring-offset-0 disabled:bg-slate-50 disabled:text-slate-400 disabled:dark:bg-slate-950 disabled:dark:text-slate-600
              ${
                error
                  ? 'border-rose-400 dark:border-rose-600 focus:border-rose-500 focus:ring-rose-500'
                  : 'border-slate-300 dark:border-slate-700 focus:border-brand-500 focus:ring-brand-500'
              }
              ${className}
            `}
          />
        </div>

        {error ? (
          <p id={errorId} className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
            {error}
          </p>
        ) : helperText ? (
          <p id={helperId} className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

MoneyInput.displayName = 'MoneyInput';
