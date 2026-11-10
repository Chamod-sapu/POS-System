import React, { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, AlertTriangle, Printer, Calculator, RefreshCw } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { closeShift, fetchXReport, XReportData, ZReportData, Shift } from '../api/shifts';
import { formatLKR, toCents } from '../../../lib/money';
import { ShiftReportReceipt } from '../../receipts/components/ShiftReportReceipt';

export interface CloseShiftModalProps {
  isOpen: boolean;
  shift: Shift | null;
  onClose: () => void;
  onSuccess: (zReport: ZReportData) => void;
}

const DENOMINATIONS = [
  { value: 5000, label: 'Rs. 5,000 Note', isNote: true },
  { value: 1000, label: 'Rs. 1,000 Note', isNote: true },
  { value: 500, label: 'Rs. 500 Note', isNote: true },
  { value: 100, label: 'Rs. 100 Note', isNote: true },
  { value: 50, label: 'Rs. 50 Note', isNote: true },
  { value: 20, label: 'Rs. 20 Note', isNote: true },
  { value: 10, label: 'Rs. 10 Coin', isNote: false },
  { value: 5, label: 'Rs. 5 Coin', isNote: false },
  { value: 2, label: 'Rs. 2 Coin', isNote: false },
  { value: 1, label: 'Rs. 1 Coin', isNote: false },
];

export const CloseShiftModal: React.FC<CloseShiftModalProps> = ({
  isOpen,
  shift,
  onClose,
  onSuccess,
}) => {
  const [xReport, setXReport] = useState<XReportData | null>(null);
  const [isLoadingX, setIsLoadingX] = useState(false);
  const [counts, setCounts] = useState<Record<number, number>>({
    5000: 0,
    1000: 0,
    500: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
    5: 0,
    2: 0,
    1: 0,
  });
  const [manualCountOverride, setManualCountOverride] = useState<string>('');
  const [useManualCount, setUseManualCount] = useState<boolean>(false);
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closedZReport, setClosedZReport] = useState<ZReportData | null>(null);

  // Fetch current shift calculations on open
  useEffect(() => {
    if (isOpen && shift) {
      setIsLoadingX(true);
      setError(null);
      setClosedZReport(null);
      fetchXReport(shift.id)
        .then((data) => setXReport(data))
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setIsLoadingX(false));
    }
  }, [isOpen, shift]);

  // Calculate counted cash from denominations
  const denomTotalCents = useMemo(() => {
    let totalLkr = 0;
    for (const d of DENOMINATIONS) {
      const qty = counts[d.value] || 0;
      totalLkr += d.value * qty;
    }
    return Math.round(totalLkr * 100);
  }, [counts]);

  const effectiveCountedCents = useMemo(() => {
    if (useManualCount) {
      const parsed = parseFloat(manualCountOverride);
      return isNaN(parsed) ? 0 : Number(toCents(manualCountOverride.trim()));
    }
    return denomTotalCents;
  }, [useManualCount, manualCountOverride, denomTotalCents]);

  const expectedCashCents = xReport ? xReport.expected_cash_cents : 0;
  const differenceCents = effectiveCountedCents - expectedCashCents;
  const absDifferenceCents = Math.abs(differenceCents);
  const requiresNote = absDifferenceCents > 10000; // Rs. 100.00 = 10,000 cents

  if (!isOpen || !shift) return null;

  const handleDenomChange = (val: number, text: string) => {
    const qty = parseInt(text, 10);
    setCounts((prev) => ({
      ...prev,
      [val]: isNaN(qty) || qty < 0 ? 0 : qty,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requiresNote && !note.trim()) {
      setError(
        'A cash discrepancy greater than Rs. 100 requires a mandatory explanation note.'
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const zReport = await closeShift(effectiveCountedCents, note.trim(), shift.id);
      setClosedZReport(zReport);
      onSuccess(zReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintZ = () => {
    window.print();
  };

  // If already closed, show Z-Report View
  if (closedZReport) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-6">
          <div className="p-4 bg-emerald-600 text-white flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5" />
              <h3 className="font-bold text-sm">Shift Closed Successfully</h3>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                className="bg-white/10 text-white border-white/20 hover:bg-white/20"
                onClick={handlePrintZ}
                leftIcon={<Printer className="w-4 h-4" />}
              >
                Print Z-Report
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="bg-white text-emerald-900 hover:bg-emerald-50"
                onClick={onClose}
              >
                Done
              </Button>
            </div>
          </div>

          <div className="p-6 bg-slate-50 flex justify-center">
            <ShiftReportReceipt data={closedZReport} paperWidth="80mm" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-6">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Close Cashier Shift & Z-Report</h3>
              <p className="text-xs text-slate-500">
                Count physical cash drawer and balance against expected register totals
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setUseManualCount(!useManualCount)}
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 underline"
          >
            {useManualCount ? 'Use Denominations Calculator' : 'Enter Direct Total'}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium">
              {error}
            </div>
          )}

          {isLoadingX ? (
            <div className="p-6 text-center text-slate-500 flex items-center justify-center space-x-2 text-xs">
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
              <span>Fetching live cash sales and drawer balance...</span>
            </div>
          ) : (
            <>
              {/* Expected Cash Header Card */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Expected in Drawer
                  </div>
                  <div className="text-base font-black text-slate-900 font-mono mt-0.5">
                    {formatLKR(expectedCashCents)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Float + Sales - Returns ± Drops
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Counted Physical Cash
                  </div>
                  <div className="text-base font-black text-emerald-600 font-mono mt-0.5">
                    {formatLKR(effectiveCountedCents)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {useManualCount ? 'Direct manual entry' : 'Calculated from breakdown'}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Drawer Discrepancy
                  </div>
                  <div
                    className={`text-base font-black font-mono mt-0.5 ${
                      differenceCents === 0
                        ? 'text-slate-800'
                        : differenceCents > 0
                        ? 'text-blue-600'
                        : 'text-rose-600'
                    }`}
                  >
                    {differenceCents > 0 ? '+' : ''}
                    {formatLKR(differenceCents)}
                  </div>
                  <div className="text-[10px] font-medium mt-0.5">
                    {differenceCents === 0 ? (
                      <span className="text-emerald-600">Perfect Match</span>
                    ) : differenceCents > 0 ? (
                      <span className="text-blue-600">Drawer is Over</span>
                    ) : (
                      <span className="text-rose-600">Drawer is Short</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Denominations Calculator Grid */}
              {!useManualCount ? (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                    Denominations Calculator
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 max-h-56 overflow-y-auto p-1 border border-slate-200 rounded-xl bg-slate-50/50">
                    {DENOMINATIONS.map((d) => {
                      const count = counts[d.value] || 0;
                      const subtotal = d.value * count;
                      return (
                        <div
                          key={d.value}
                          className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs space-y-1"
                        >
                          <div className="flex justify-between items-center text-[11px] font-bold text-slate-700">
                            <span>{d.label}</span>
                          </div>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={count === 0 ? '' : count}
                            placeholder="0"
                            onChange={(e) => handleDenomChange(d.value, e.target.value)}
                            className="w-full text-center py-1 bg-slate-50 border border-slate-200 rounded font-mono font-bold text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                          <div className="text-right text-[10px] font-mono text-slate-500 truncate">
                            {formatLKR(subtotal * 100)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Direct Counted Cash Amount (LKR)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                      Rs.
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={manualCountOverride}
                      onChange={(e) => setManualCountOverride(e.target.value)}
                      className="w-full pl-12 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl font-mono text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="0.00"
                      autoFocus
                    />
                  </div>
                </div>
              )}

              {/* Discrepancy Note Prompt (Mandatory when |diff| > Rs. 100) */}
              {requiresNote && (
                <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl space-y-2">
                  <div className="flex items-center space-x-2 text-amber-900 font-bold text-xs uppercase tracking-wide">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>Discrepancy Exceeds Rs. 100 — Explanation Note Required</span>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    A difference of {formatLKR(absDifferenceCents)} was detected between physical
                    cash and POS ledger. You must document the reason before this shift can be
                    closed.
                  </p>
                  <textarea
                    rows={2}
                    required
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Provide details on the drawer variance (e.g., untracked change exchange, vendor drop, cashier error)..."
                    className="w-full p-2.5 bg-white border border-amber-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              )}

              {/* Optional Note for balanced shifts */}
              {!requiresNote && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Shift Note (Optional)
                  </label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional notes or remarks on this cashier shift..."
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              )}
            </>
          )}

          <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              isLoading={isSubmitting}
              disabled={isLoadingX}
              leftIcon={<CheckCircle2 className="w-4 h-4" />}
            >
              Reconcile & Close Shift
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
