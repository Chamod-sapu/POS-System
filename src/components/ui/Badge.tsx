import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple' | 'brand' | 'stock-in' | 'stock-low' | 'stock-out';
  size?: 'sm' | 'md';
  dot?: boolean;
  pulseDot?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  dot = false,
  pulseDot = false,
  icon,
  className = '',
}) => {
  const variantClasses = {
    success: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/80',
    warning: 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/80',
    danger: 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/80',
    info: 'bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800/80',
    neutral: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700',
    purple: 'bg-purple-50 dark:bg-purple-950/50 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800/80',
    brand: 'bg-brand-50 dark:bg-brand-950/50 text-brand-800 dark:text-brand-300 border-brand-200 dark:border-brand-800/80',
    'stock-in': 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/80',
    'stock-low': 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/80',
    'stock-out': 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/80',
  }[variant];

  const dotColors = {
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
    info: 'bg-sky-500',
    neutral: 'bg-slate-400 dark:bg-slate-500',
    purple: 'bg-purple-500',
    brand: 'bg-brand-500',
    'stock-in': 'bg-emerald-500',
    'stock-low': 'bg-amber-500',
    'stock-out': 'bg-rose-500',
  }[variant];

  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  }[size];

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full border tabular-nums shadow-subtle ${variantClasses} ${sizeClasses} ${className}`}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full mr-1.5 flex-shrink-0 ${dotColors} ${
            pulseDot ? 'animate-pulse' : ''
          }`}
        />
      )}
      {icon && <span className="mr-1 inline-flex flex-shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};
