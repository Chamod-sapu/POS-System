import React, { useState } from 'react';
import { Clock, Play, DollarSign, ShieldCheck } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { openShift, Shift } from '../api/shifts';
import { formatLKR, toCents } from '../../../lib/money';

export interface ShiftGateProps {
  onShiftOpened: (shift: Shift) => void;
}

const PRESET_FLOATS = [0, 2000, 5000, 10000];

export const ShiftGate: React.FC<ShiftGateProps> = ({ onShiftOpened }) => {
  const [floatAmount, setFloatAmount] = useState<string>('5000');
  const [terminalName, setTerminalName] = useState<string>('Main Terminal');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const floatLkr = parseFloat(floatAmount);
    if (isNaN(floatLkr) || floatLkr < 0) {
      setError('Please enter a valid non-negative float amount.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const cents = Number(toCents(floatAmount.trim()));
      const shift = await openShift(cents, terminalName.trim() || 'Main Terminal');
      onShiftOpened(shift);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 min-h-[500px]">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-6 bg-slate-900 text-white flex items-center space-x-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-400 flex items-center justify-center flex-shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Cash Register Locked</h2>
            <p className="text-xs text-slate-400">
              An active shift is required before scanning items or taking payments
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Declare Starting Drawer Float (LKR)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-slate-400">
                Rs.
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={floatAmount}
                onChange={(e) => setFloatAmount(e.target.value)}
                className="w-full pl-14 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xl font-black text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="0.00"
                autoFocus
              />
            </div>

            {/* Float Presets */}
            <div className="flex items-center gap-2 pt-1">
              {PRESET_FLOATS.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setFloatAmount(val.toString())}
                  className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg border transition-all ${
                    parseFloat(floatAmount) === val
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {formatLKR(val * 100)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Register / Terminal Name
            </label>
            <input
              type="text"
              value={terminalName}
              onChange={(e) => setTerminalName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="e.g. Counter 1 / Main Register"
            />
          </div>

          <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3 flex items-start space-x-2.5 text-xs text-emerald-900">
            <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] leading-tight">
              Opening a shift initializes drawer cash tracking and enables real-time sales
              reconciliation under your staff profile.
            </p>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full justify-center text-sm font-bold py-3.5"
            isLoading={isLoading}
            leftIcon={<Play className="w-5 h-5" />}
          >
            Open Shift & Activate Register
          </Button>
        </form>
      </div>
    </div>
  );
};
