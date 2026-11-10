import React, { forwardRef, useId } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options?: SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      helperText,
      options,
      children,
      id: customId,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const selectId = customId || generatedId;
    const errorId = `${selectId}-error`;
    const helperId = `${selectId}-helper`;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5"
          >
            {label}
            {props.required && <span className="text-rose-500 ml-1">*</span>}
          </label>
        )}

        <div className="relative rounded-lg shadow-subtle">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? errorId : helperText ? helperId : undefined}
            className={`
              block w-full min-h-[44px] pl-3.5 pr-10 py-2.5 rounded-lg border text-sm transition-subtle text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900
              appearance-none outline-none focus:ring-2 focus:ring-offset-0 disabled:bg-slate-50 disabled:text-slate-400 disabled:dark:bg-slate-950 disabled:dark:text-slate-600
              ${
                error
                  ? 'border-rose-400 dark:border-rose-600 focus:border-rose-500 focus:ring-rose-500'
                  : 'border-slate-300 dark:border-slate-700 focus:border-brand-500 focus:ring-brand-500'
              }
              ${className}
            `}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                    {opt.label}
                  </option>
                ))
              : children}
          </select>

          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
            <ChevronDown className="w-4 h-4" />
          </div>
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

Select.displayName = 'Select';
