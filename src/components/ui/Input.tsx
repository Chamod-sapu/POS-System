import React, { forwardRef, useId } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      id: customId,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = customId || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5"
          >
            {label}
            {props.required && <span className="text-rose-500 ml-1">*</span>}
          </label>
        )}

        <div className="relative rounded-lg shadow-subtle">
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
              {leftIcon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? errorId : helperText ? helperId : undefined}
            className={`
              block w-full min-h-[44px] rounded-lg border text-sm transition-subtle text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900
              placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:ring-2 focus:ring-offset-0 disabled:bg-slate-50 disabled:text-slate-400 disabled:dark:bg-slate-950 disabled:dark:text-slate-600
              ${leftIcon ? 'pl-10' : 'pl-3.5'}
              ${rightIcon ? 'pr-10' : 'pr-3.5'}
              ${
                error
                  ? 'border-rose-400 dark:border-rose-600 focus:border-rose-500 focus:ring-rose-500'
                  : 'border-slate-300 dark:border-slate-700 focus:border-brand-500 focus:ring-brand-500'
              }
              ${className}
            `}
            {...props}
          />

          {rightIcon && (
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
              {rightIcon}
            </div>
          )}
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

Input.displayName = 'Input';
