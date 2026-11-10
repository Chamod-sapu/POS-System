import React from 'react';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  isLoading = false,
}) => {
  const icon = {
    danger: <AlertCircle className="w-6 h-6 text-rose-600 dark:text-rose-400" />,
    warning: <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />,
    primary: <Info className="w-6 h-6 text-brand-600 dark:text-brand-400" />,
  }[variant];

  const iconBg = {
    danger: 'bg-rose-100 dark:bg-rose-950/60',
    warning: 'bg-amber-100 dark:bg-amber-950/60',
    primary: 'bg-brand-100 dark:bg-brand-950/60',
  }[variant];

  const buttonVariant = {
    danger: 'danger',
    warning: 'primary',
    primary: 'primary',
  }[variant] as 'danger' | 'primary';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      closeOnEscape={!isLoading}
      closeOnOverlayClick={!isLoading}
      showCloseButton={!isLoading}
      footer={
        <>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            {cancelText}
          </Button>
          <Button
            variant={buttonVariant}
            onClick={onConfirm}
            isLoading={isLoading}
            className="w-full sm:w-auto"
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="flex items-start space-x-4">
        <div
          className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center shadow-subtle ${iconBg}`}
        >
          {icon}
        </div>
        <div className="flex-1">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-6">{title}</h3>
          <div className="mt-1 text-sm text-slate-600 dark:text-slate-400 leading-5">{message}</div>
        </div>
      </div>
    </Modal>
  );
};
