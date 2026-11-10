import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: React.ReactNode;
  durationMs?: number;
}

export interface ToastContextType {
  toast: {
    success: (message: React.ReactNode, durationMs?: number) => void;
    error: (message: React.ReactNode, durationMs?: number) => void;
    warning: (message: React.ReactNode, durationMs?: number) => void;
    info: (message: React.ReactNode, durationMs?: number) => void;
  };
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const defaultToast: ToastContextType['toast'] = {
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {},
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: React.ReactNode, durationMs = 4000) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newToast: ToastItem = { id, type, message, durationMs };

      setToasts((prev) => [...prev, newToast]);

      if (durationMs > 0) {
        setTimeout(() => {
          dismissToast(id);
        }, durationMs);
      }
    },
    [dismissToast]
  );

  const toast = {
    success: (msg: React.ReactNode, duration?: number) => addToast('success', msg, duration),
    error: (msg: React.ReactNode, duration?: number) => addToast('error', msg, duration),
    warning: (msg: React.ReactNode, duration?: number) => addToast('warning', msg, duration),
    info: (msg: React.ReactNode, duration?: number) => addToast('info', msg, duration),
  };

  return (
    <ToastContext.Provider value={{ toast, dismissToast }}>
      {children}

      {/* Floating Toast Container */}
      <div
        aria-live="polite"
        className="toast-container fixed bottom-4 right-4 z-50 flex flex-col space-y-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismissToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

const ToastCard: React.FC<{ toast: ToastItem; onDismiss: () => void }> = ({
  toast,
  onDismiss,
}) => {
  const icon = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />,
    info: <Info className="w-5 h-5 text-sky-500 flex-shrink-0" />,
  }[toast.type];

  const borderClass = {
    success: 'border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100',
    error: 'border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100',
    warning: 'border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100',
    info: 'border-sky-200 dark:border-sky-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100',
  }[toast.type];

  return (
    <div
      role="alert"
      className={`pointer-events-auto flex items-start space-x-3 p-4 rounded-xl border shadow-raised transition-subtle ${borderClass}`}
    >
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 text-sm font-medium leading-5">{toast.message}</div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-subtle"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const useToast = (): ToastContextType['toast'] => {
  const context = useContext(ToastContext);
  return context ? context.toast : defaultToast;
};
