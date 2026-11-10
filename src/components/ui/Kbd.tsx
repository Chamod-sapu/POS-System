import React from 'react';

export interface KbdProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Keyboard shortcut chip adhering to the Wewala Design System (e.g. F2, F4, Esc, Ctrl+K).
 */
export const Kbd: React.FC<KbdProps> = ({ children, className = '' }) => {
  return (
    <kbd
      className={`inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded shadow-subtle select-none uppercase tracking-wider ${className}`}
    >
      {children}
    </kbd>
  );
};

