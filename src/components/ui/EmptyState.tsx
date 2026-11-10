import React from 'react';
import { PackageOpen } from 'lucide-react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-white dark:bg-slate-900/60 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 shadow-subtle ${className}`}
    >
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 mb-4 shadow-subtle">
        {icon || <PackageOpen className="w-7 h-7" />}
      </div>
      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">{title}</h3>
      {description && (
        <p className="mt-1.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
};
