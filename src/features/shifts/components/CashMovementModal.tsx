import React, { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, DollarSign } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { recordCashMovement, Shift, CashMovement } from '../api/shifts';
import { formatLKR, toCents } from '../../../lib/money';

export interface CashMovementModalProps {
  isOpen: boolean;
  shift: Shift | null;
  onClose: () => void;
  onSuccess: (movement: CashMovement) => void;
}

export const CashMovementModal: React.FC<CashMovementModalProps> = ({
  isOpen,
  shift,
  onClose,
  onSuccess,
}) => {
  const [kind, setKind] = useState<'cash_in' | 'cash_out'>('cash_in');
  const [amountLkr, setAmountLkr] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !shift) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amountLkr);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a positive amount for the cash movement.');
      return;
    }

    if (!reason.trim() || reason.trim().length < 3) {
      setError('A descriptive reason is required (minimum 3 characters).');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const cents = Number(toCents(parsedAmount.toString()));
      const movement = await recordCashMovement(
        shift.id,
        kind,
        cents,
        reason.trim()
      );
      onSuccess(movement);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 flex items-center space-x-3 bg-slate-50/50">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              kind === 'cash_in'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-rose-100 text-rose-700'
            }`}
          >
            {kind === 'cash_in' ? (
              <ArrowDownRight className="w-5 h-5" />
            ) : (
              <ArrowUpRight className="w-5 h-5" />
            )}
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {kind === 'cash_in' ? 'Cash In (Paid In)' : 'Cash Out (Drop / Paid Out)'}
            </h3>
            <p className="text-xs text-slate-500">
              Shift #{shift.id.slice(0, 8)} • Register cash adjustment
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium">
              {error}
            </div>
          )}

          {/* Movement Type Tabs */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              Movement Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setKind('cash_in')}
                className={`flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition-colors ${
                  kind === 'cash_in'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ArrowDownRight className="w-4 h-4 text-emerald-600" />
                <span>Cash In (Float Add)</span>
              </button>
              <button
                type="button"
                onClick={() => setKind('cash_out')}
                className={`flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition-colors ${
                  kind === 'cash_out'
                    ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ArrowUpRight className="w-4 h-4 text-rose-600" />
                <span>Cash Out (Drop/Expense)</span>
              </button>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Amount (LKR)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                Rs.
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amountLkr}
                onChange={(e) => setAmountLkr(e.target.value)}
                className="w-full pl-12 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl font-mono text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="0.00"
                autoFocus
              />
            </div>
          </div>

          {/* Reason Input */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Mandatory Reason / Description
            </label>
            <textarea
              rows={2}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder={
                kind === 'cash_in'
                  ? 'e.g., Change float top up from main vault'
                  : 'e.g., Safe drop, petty cash for tea/refreshments'
              }
            />
          </div>

          <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={kind === 'cash_in' ? 'primary' : 'danger'}
              size="sm"
              isLoading={isLoading}
              leftIcon={<DollarSign className="w-4 h-4" />}
            >
              Confirm Cash {kind === 'cash_in' ? 'In' : 'Out'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
