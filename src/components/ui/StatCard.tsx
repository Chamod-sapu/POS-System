import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

export interface StatCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  change?: {
    value: string;
    isPositive?: boolean;
    label?: string;
  };
  sparkline?: number[];
  variant?: 'default' | 'emerald' | 'amber' | 'blue' | 'purple' | 'brand';
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  change,
  sparkline,
  variant = 'default',
  className = '',
}) => {
  const iconBg = {
    default: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
    emerald: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
    amber: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300',
    blue: 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300',
    purple: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300',
    brand: 'bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300',
  }[variant];

  // Render a clean SVG sparkline if data array is provided
  const renderSparkline = () => {
    if (!sparkline || sparkline.length < 2) return null;
    const min = Math.min(...sparkline);
    const max = Math.max(...sparkline);
    const range = max - min || 1;
    const width = 80;
    const height = 24;

    const points = sparkline
      .map((val, idx) => {
        const x = (idx / (sparkline.length - 1)) * width;
        const y = height - ((val - min) / range) * (height - 6) - 3;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

    return (
      <svg width={width} height={height} className="overflow-visible opacity-75">
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
          className="text-brand-500"
        />
      </svg>
    );
  };

  return (
    <div
      className={`p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-subtle transition-subtle hover:shadow-raised ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {title}
        </span>
        {icon && (
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-subtle ${iconBg}`}>
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tracking-tight">
          {value}
        </div>
        {sparkline && <div className="hidden sm:block">{renderSparkline()}</div>}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs">
        {change ? (
          <div className="flex items-center space-x-1.5">
            <span
              className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                change.isPositive
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
              }`}
            >
              {change.isPositive ? (
                <TrendingUp className="w-3 h-3 mr-0.5" />
              ) : (
                <TrendingDown className="w-3 h-3 mr-0.5" />
              )}
              {change.isPositive ? '+' : ''}
              {change.value}
            </span>
            <span className="text-slate-500 dark:text-slate-400 text-[11px]">
              {change.label || 'vs yesterday'}
            </span>
          </div>
        ) : subtitle ? (
          <p className="text-slate-500 dark:text-slate-400 text-xs">{subtitle}</p>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
};
