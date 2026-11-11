import React, { useEffect, useRef, useId } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  className?: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  className = '',
  initialFocusRef,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  // Stable reference for onClose so re-renders never trigger effects
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Initial focus and body scroll lock (runs strictly ONCE when modal transitions to open)
  useEffect(() => {
    if (!isOpen) return;

    previousActiveElementRef.current = document.activeElement as HTMLElement;

    // Prevent body background scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Set initial focus smoothly after child elements mount in the DOM
    const focusTimer = setTimeout(() => {
      if (!modalRef.current) return;

      // 1. Explicit initial focus ref passed by caller
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
        return;
      }

      // 2. Explicit autofocus element inside modal content
      const autoFocusEl = modalRef.current.querySelector<HTMLElement>('[autofocus], [data-autofocus]');
      if (autoFocusEl) {
        autoFocusEl.focus();
        return;
      }

      // 3. First form input in the modal body (excluding the top header close button)
      const inputEl = modalRef.current.querySelector<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])'
      );
      if (inputEl) {
        inputEl.focus();
        return;
      }

      // 4. First non-close action button (e.g. Confirm or Action button in footer)
      const actionButton = modalRef.current.querySelector<HTMLElement>(
        'button:not([disabled]):not([aria-label="Close dialog"])'
      );
      if (actionButton) {
        actionButton.focus();
        return;
      }

      // 5. Fallback: focus the modal container itself
      modalRef.current.focus();
    }, 20);

    return () => {
      clearTimeout(focusTimer);
      document.body.style.overflow = originalOverflow;
      previousActiveElementRef.current?.focus();
    };
  }, [isOpen]); // Intentionally ONLY depends on isOpen to never steal focus during typing or re-renders

  // Keyboard navigation: Escape key and Tab focus trap
  useEffect(() => {
    if (!isOpen) return;

    const focusableSelectors =
      'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      // Focus trap navigation inside the modal
      if (e.key === 'Tab' && modalRef.current) {
        const elements = modalRef.current.querySelectorAll<HTMLElement>(focusableSelectors);
        if (elements.length === 0) return;

        const firstElement = elements[0];
        const lastElement = elements[elements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, closeOnEscape]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-full m-4',
  }[size];

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descId : undefined}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 transition-subtle"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className={`w-full ${sizeClasses} bg-white dark:bg-slate-900 rounded-2xl shadow-overlay border border-slate-200 dark:border-slate-800 overflow-hidden outline-none transition-subtle ${className}`}
      >
        {/* Header */}
        {(title || showCloseButton) && (
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
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Body Content */}
        <div className="p-6 text-slate-900 dark:text-slate-100">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 flex items-center justify-end space-x-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
