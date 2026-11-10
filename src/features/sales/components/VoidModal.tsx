import React, { useState } from 'react';
import { AlertOctagon, Ban } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Bill } from '../../receipts/types';
import { voidSale, VoidSaleResult } from '../api/returns';
import { formatLKR } from '../../../lib/money';

export interface VoidModalProps {
  isOpen: boolean;
  bill: Bill;
  onClose: () => void;
  onSuccess: (result: VoidSaleResult) => void;
}

export const VoidModal: React.FC<VoidModalProps> = ({
  isOpen,
  bill,
  onClose,
  onSuccess,
}) => {
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reason.trim() || reason.trim().length < 5) {
      setError('A comprehensive void reason is required (minimum 5 characters).');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await voidSale(bill.id, reason.trim());
      onSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-rose-100 flex items-center space-x-3 bg-rose-50/60">
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center flex-shrink-0">
            <AlertOctagon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Void Entire Sale Transaction</h3>
            <p className="text-xs text-rose-700 font-medium">
              Irreversible managerial override
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium">
              {error}
            </div>
          )}

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Bill Number:</span>
              <span className="font-bold font-mono text-slate-900">#{bill.bill_no}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Transaction Value:</span>
              <span className="font-bold font-mono text-slate-900">
                {formatLKR(bill.total_cents)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Cashier:</span>
              <span className="font-medium text-slate-900">{bill.cashier.name}</span>
            </div>
          </div>

          <div className="text-xs text-slate-600 space-y-1.5 bg-amber-50/80 p-3 rounded-xl border border-amber-200">
            <p className="font-bold text-amber-900">Notice on voiding:</p>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800">
              <li>Stock quantities & FEFO batches will be automatically restored.</li>
              <li>Customer loyalty points earned will be reversed.</li>
              <li>Cash payments will be excluded from the shift expected drawer total.</li>
              <li>This action will be permanently logged in the immutable audit log.</li>
            </ul>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Reason for Voiding (Mandatory)
            </label>
            <textarea
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Cashier entered duplicate transaction, customer card declined after bill generation..."
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
              autoFocus
            />
          </div>

          <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              isLoading={isSubmitting}
              leftIcon={<Ban className="w-4 h-4" />}
            >
              Confirm & Void Sale
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

