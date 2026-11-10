import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      className = '',
      type = 'button',
      ...props
    },
    ref
  ) => {
    // Base styles: Minimum 44px touch target (adapts in compact mode), smooth transition, pressed state, accessible focus
    const baseClasses =
      'inline-flex items-center justify-center font-semibold rounded-lg transition-subtle active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none select-none cursor-pointer';

    // Variant classes with brand teal and dark mode support
    const variantClasses = {
      primary:
        'bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white shadow-subtle focus:ring-brand-500 dark:bg-brand-600 dark:hover:bg-brand-500 dark:active:bg-brand-700 dark:text-white',
      secondary:
        'bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white shadow-subtle focus:ring-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-100',
      danger:
        'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-subtle focus:ring-rose-500 dark:bg-rose-600 dark:hover:bg-rose-500',
      outline:
        'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-subtle focus:ring-brand-500',
      ghost:
        'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white focus:ring-brand-400',
    }[variant];

    // Size classes (ensuring minimum 44px touch target)
    const sizeClasses = {
      sm: 'px-3 py-1.5 text-xs min-h-[44px] min-w-[44px]',
      md: 'px-4 py-2.5 text-sm min-h-[44px] min-w-[44px]',
      lg: 'px-6 py-3.5 text-base min-h-[50px] min-w-[50px]',
    }[size];

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={`${baseClasses} ${variantClasses} ${sizeClasses} ${className}`}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin flex-shrink-0" aria-hidden="true" />
            <span>{children}</span>
          </>
        ) : (
          <>
            {leftIcon && <span className="mr-2 flex-shrink-0 inline-flex">{leftIcon}</span>}
            <span>{children}</span>
            {rightIcon && <span className="ml-2 flex-shrink-0 inline-flex">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
