import React from 'react';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className = '',
  ariaLabel,
}: SegmentedControlProps<T>): React.ReactElement {
  const sizeClasses = {
    sm: 'p-0.5 text-xs',
    md: 'p-1 text-sm',
  }[size];

  const buttonSizeClasses = {
    sm: 'px-2.5 py-1 min-h-[32px]',
    md: 'px-3.5 py-1.5 min-h-[38px]',
  }[size];

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex items-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl select-none ${sizeClasses} ${className}`}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center justify-center font-semibold rounded-lg transition-subtle cursor-pointer ${buttonSizeClasses} ${
              isSelected
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-subtle border border-slate-200/80 dark:border-slate-700/80'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/40'
            }`}
          >
            {opt.icon && <span className="mr-1.5 flex-shrink-0 inline-flex">{opt.icon}</span>}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

