import React from 'react';
import { Loader2 } from 'lucide-react';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'emerald' | 'slate' | 'white';
  label?: string;
  className?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  color = 'emerald',
  label = 'Loading...',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-10 h-10',
  }[size];

  const colorClasses = {
    emerald: 'text-emerald-600',
    slate: 'text-slate-600',
    white: 'text-white',
  }[color];

  return (
    <div
      role="status"
      aria-label={label}
      className={`inline-flex items-center justify-center ${className}`}
    >
      <Loader2 className={`animate-spin ${sizeClasses} ${colorClasses}`} />
      <span className="sr-only">{label}</span>
    </div>
  );
};

