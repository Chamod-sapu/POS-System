import React from 'react';

export interface TabItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'pills' | 'underline';
  className?: string;
  ariaLabel?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = 'pills',
  className = '',
  ariaLabel = 'Navigation tabs',
}) => {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex items-center space-x-1 ${
        variant === 'underline' ? 'border-b border-slate-200 dark:border-slate-800 pb-px' : 'p-1 bg-slate-100 dark:bg-slate-800 rounded-xl'
      } ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;

        if (variant === 'underline') {
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              disabled={tab.disabled}
              onClick={() => onChange(tab.id)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-subtle flex items-center space-x-2 select-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                isActive
                  ? 'border-brand-600 text-brand-700 dark:text-brand-400 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:border-slate-300 dark:hover:border-slate-700'
              } disabled:opacity-40 disabled:pointer-events-none`}
            >
              {tab.icon && <span className="inline-flex flex-shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.badge && <span className="ml-1.5">{tab.badge}</span>}
            </button>
          );
        }

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            className={`px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-subtle flex items-center space-x-2 select-none cursor-pointer min-h-[38px] focus:outline-none focus:ring-2 focus:ring-brand-500 ${
              isActive
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-subtle border border-slate-200/80 dark:border-slate-700/80'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-700/50'
            } disabled:opacity-40 disabled:pointer-events-none`}
          >
            {tab.icon && <span className="inline-flex flex-shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge && <span className="ml-1.5">{tab.badge}</span>}
          </button>
        );
      })}
    </div>
  );
};

