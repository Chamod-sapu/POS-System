import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  backTo,
  backLabel = 'Back',
  badge,
  actions,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 mb-6 border-b border-slate-200 dark:border-slate-800 ${className}`}
    >
      <div>
        {backTo && (
          <Link
            to={backTo}
            className="inline-flex items-center text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-2 transition-subtle"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            {backLabel}
          </Link>
        )}
        <div className="flex items-center space-x-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
          {badge && <div>{badge}</div>}
        </div>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>

      {actions && <div className="flex items-center space-x-3 flex-wrap gap-2">{actions}</div>}
    </div>
  );
};
