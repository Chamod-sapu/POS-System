import React, { useEffect, useRef, useId } from 'react';
import { X } from 'lucide-react';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  position?: 'right' | 'bottom';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  position = 'right',
  size = 'md',
  className = '',
}) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-xl',
    xl: 'max-w-3xl',
  }[size];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descId : undefined}
      className="fixed inset-0 z-50 overflow-hidden bg-slate-950/60 backdrop-blur-sm transition-subtle"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={drawerRef}
        tabIndex={-1}
        className={`fixed bg-white dark:bg-slate-900 shadow-overlay flex flex-col transition-subtle outline-none ${
          position === 'right'
            ? `inset-y-0 right-0 w-full ${widthClasses} border-l border-slate-200 dark:border-slate-800`
            : 'inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t border-slate-200 dark:border-slate-800'
        } ${className}`}
      >
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50">
          <div>
            {title && (
              <h2 id={titleId} className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {title}
              </h2>
            )}
            {description && (
              <p id={descId} className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-subtle focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 text-slate-900 dark:text-slate-100">{children}</div>

        {/* Drawer Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 flex items-center justify-end space-x-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

