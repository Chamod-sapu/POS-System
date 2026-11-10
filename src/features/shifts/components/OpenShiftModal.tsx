import React, { useState } from 'react';
import { DollarSign, Play } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { openShift, Shift } from '../api/shifts';
import { formatLKR, toCents } from '../../../lib/money';

export interface OpenShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (shift: Shift) => void;
}

const PRESET_FLOATS = [0, 2000, 5000, 10000];

export const OpenShiftModal: React.FC<OpenShiftModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [floatAmount, setFloatAmount] = useState<string>('5000');
  const [terminalName, setTerminalName] = useState<string>('Main Terminal');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const floatLkr = parseFloat(floatAmount);
    if (isNaN(floatLkr) || floatLkr < 0) {
      setError('Please enter a valid non-negative opening float amount.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const cents = Number(toCents(floatAmount.trim()));
      const newShift = await openShift(cents, terminalName.trim() || 'Main Terminal');
      onSuccess(newShift);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-6 border-b border-slate-100 flex items-center space-x-3 bg-slate-50/50">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Open Cashier Shift</h3>
            <p className="text-xs text-slate-500">
              Declare drawer opening float to activate POS register
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Opening Float (LKR)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                Rs.
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={floatAmount}
                onChange={(e) => setFloatAmount(e.target.value)}
                className="w-full pl-12 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl font-mono text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="0.00"
                autoFocus
              />
            </div>

            {/* Quick float presets */}
            <div className="flex items-center gap-2 mt-2.5">
              {PRESET_FLOATS.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setFloatAmount(val.toString())}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                    parseFloat(floatAmount) === val
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {formatLKR(val * 100)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Terminal Identifier
            </label>
            <input
              type="text"
              value={terminalName}
              onChange={(e) => setTerminalName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="e.g. Register 1 / Counter A"
            />
          </div>

          <div className="pt-2 flex items-center justify-end space-x-3">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isLoading}
              leftIcon={<Play className="w-4 h-4" />}
            >
              Start Shift
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
