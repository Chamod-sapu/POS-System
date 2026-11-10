import React from 'react';
import { Clock, CheckCircle2, AlertCircle, RefreshCw, MessageSquareOff } from 'lucide-react';
import { SmsStatus } from '../api/sms';

export interface SmsStatusBadgeProps {
  status: SmsStatus | 'not_sent';
  attempts?: number;
  className?: string;
  showIcon?: boolean;
}

export const SmsStatusBadge: React.FC<SmsStatusBadgeProps> = ({
  status,
  attempts = 0,
  className = '',
  showIcon = true,
}) => {
  switch (status) {
    case 'sent':
      return (
        <span
          className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 ${className}`}
        >
          {showIcon && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />}
          <span>SMS Sent</span>
        </span>
      );

    case 'sending':
      return (
        <span
          className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200 ${className}`}
        >
          {showIcon && <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin flex-shrink-0" />}
          <span>Sending...</span>
        </span>
      );

    case 'pending':
      return (
        <span
          className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200 ${className}`}
        >
          {showIcon && <Clock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />}
          <span>Pending{attempts > 0 ? ` (retry ${attempts}/5)` : ''}</span>
        </span>
      );

    case 'failed':
      return (
        <span
          className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200 ${className}`}
        >
          {showIcon && <AlertCircle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />}
          <span>Failed{attempts > 0 ? ` (${attempts} attempts)` : ''}</span>
        </span>
      );

    case 'skipped':
    case 'not_sent':
    default:
      return (
        <span
          className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 ${className}`}
        >
          {showIcon && <MessageSquareOff className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
          <span>Not Sent</span>
        </span>
      );
  }
};

