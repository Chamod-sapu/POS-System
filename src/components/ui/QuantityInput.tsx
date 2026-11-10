import React, { forwardRef, useId } from 'react';
import { Minus, Plus } from 'lucide-react';

export interface QuantityInputProps {
  value: string | number;
  onChange: (val: string) => void;
  allowDecimal?: boolean;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  error?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export const QuantityInput = forwardRef<HTMLInputElement, QuantityInputProps>(
  (
    {
      value,
      onChange,
      allowDecimal = false,
      unit,
      min = 0,
      max,
      step,
      label,
      error,
      disabled = false,
      id: customId,
      className = '',
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = customId || generatedId;

    const defaultStep = step ?? (allowDecimal ? 0.25 : 1);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.trim();

      if (raw === '') {
        onChange('');
        return;
      }

      if (!allowDecimal) {
        // Only allow non-negative integers
        if (/^\d*$/.test(raw)) {
          onChange(raw);
        }
      } else {
        // Allow decimals with at most 3 decimal places
        if (/^\d*(?:\.\d{0,3})?$/.test(raw)) {
          onChange(raw);
        }
      }
    };

    const handleStep = (direction: 1 | -1) => {
      if (disabled) return;
      const current = parseFloat(String(value)) || 0;
      let next = current + direction * defaultStep;

      if (next < min) next = min;
      if (max !== undefined && next > max) next = max;

      if (!allowDecimal) {
        onChange(Math.round(next).toString());
      } else {
        // Fix floating precision artifacts to 3 decimals max
        onChange((Math.round(next * 1000) / 1000).toString());
      }
    };

    return (
      <div className={`w-full ${className}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5"
          >
            {label}
          </label>
        )}

        <div className="flex items-center space-x-1.5">
          {/* Decrement Button */}
          <button
            type="button"
            disabled={disabled || (parseFloat(String(value)) || 0) <= min}
            onClick={() => handleStep(-1)}
            aria-label="Decrease quantity"
            className="flex-shrink-0 w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 active:bg-slate-200 dark:active:bg-slate-600 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:pointer-events-none transition-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-subtle cursor-pointer"
          >
            <Minus className="w-4 h-4" />
          </button>

          {/* Value Input */}
          <div className="relative flex-1">
            <input
              ref={ref}
              id={inputId}
              type="text"
              inputMode="decimal"
              value={value}
              onChange={handleInputChange}
              disabled={disabled}
              className={`
                block w-full min-h-[44px] text-center font-mono font-semibold text-base py-2 rounded-lg border transition-subtle tabular-nums
                bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-subtle
                focus:outline-none focus:ring-2 focus:ring-offset-0 disabled:bg-slate-50 disabled:text-slate-400 disabled:dark:bg-slate-950 disabled:dark:text-slate-600
                ${unit ? 'pr-12' : 'px-3'}
                ${
                  error
                    ? 'border-rose-400 dark:border-rose-600 focus:border-rose-500 focus:ring-rose-500'
                    : 'border-slate-300 dark:border-slate-700 focus:border-brand-500 focus:ring-brand-500'
                }
              `}
            />
            {unit && (
              <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase">
                {unit}
              </span>
            )}
          </div>

          {/* Increment Button */}
          <button
            type="button"
            disabled={disabled || (max !== undefined && (parseFloat(String(value)) || 0) >= max)}
            onClick={() => handleStep(1)}
            aria-label="Increase quantity"
            className="flex-shrink-0 w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 active:bg-slate-200 dark:active:bg-slate-600 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:pointer-events-none transition-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-subtle cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {error && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
      </div>
    );
  }
);

QuantityInput.displayName = 'QuantityInput';
