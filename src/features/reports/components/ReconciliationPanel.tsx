import React from 'react';
import {
  CheckCircle2,
  AlertOctagon,
  ShieldCheck,
  RefreshCw,
  TrendingDown,
  Layers,
  Boxes,
  FileDigit,
} from 'lucide-react';
import { ReconciliationReport } from '../api/reports';
import { formatLKR } from '../../../lib/money';

export interface ReconciliationPanelProps {
  reconciliation: ReconciliationReport | null;
  isLoading?: boolean;
}

export const ReconciliationPanel: React.FC<ReconciliationPanelProps> = ({
  reconciliation,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-center space-x-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
        <RefreshCw className="w-4 h-4 animate-spin text-emerald-600 dark:text-emerald-400" />
        <span>Executing four-way mathematical ledger reconciliation...</span>
      </div>
    );
  }

  if (!reconciliation) return null;

  const {
    all_passed,
    payments_balance_check,
    items_balance_check,
    stock_movements_check,
    bill_sequence_check,
  } = reconciliation;

  return (
    <div
      className={`rounded-2xl border transition-all ${
        all_passed
          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
          : 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800/60'
      } p-5 space-y-4`}
    >
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3 border-current/10">
        <div className="flex items-center space-x-2.5">
          {all_passed ? (
            <div className="w-8 h-8 rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-rose-600 dark:bg-rose-500 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
              <AlertOctagon className="w-5 h-5" />
            </div>
          )}
          <div>
            <h4
              className={`text-sm font-black uppercase tracking-wider ${
                all_passed ? 'text-emerald-950 dark:text-emerald-200' : 'text-rose-950 dark:text-rose-200'
              }`}
            >
              {all_passed
                ? 'Financial Ledger Integrity: 100% Balanced'
                : 'Audit Alert: Ledger Discrepancy Detected'}
            </h4>
            <p
              className={`text-xs ${
                all_passed ? 'text-emerald-800 dark:text-emerald-400' : 'text-rose-800 dark:text-rose-400'
              }`}
            >
              {all_passed
                ? 'All four mathematical balances and gapless sequence checks passed.'
                : 'One or more audit invariants failed. Immediate review required.'}
            </p>
          </div>
        </div>
      </div>

      {/* 4 Audit Checks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Payments Balance Check */}
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center space-x-1">
              <Layers className="w-3.5 h-3.5" />
              <span>Payments Balance</span>
            </span>
            {payments_balance_check.passed ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                PASSED
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300">
                FAILED
              </span>
            )}
          </div>
          <div className="text-xs text-slate-700 dark:text-slate-300 space-y-0.5 font-mono">
            <div className="flex justify-between">
              <span className="text-slate-400 dark:text-slate-500">Sales:</span>
              <span>{formatLKR(payments_balance_check.sum_sales_cents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 dark:text-slate-500">Payments - Chg:</span>
              <span>
                {formatLKR(payments_balance_check.sum_payments_minus_change_cents)}
              </span>
            </div>
            <div
              className={`flex justify-between font-bold border-t border-slate-100 dark:border-slate-800 pt-0.5 ${
                payments_balance_check.diff_cents === 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              <span>Variance:</span>
              <span>{formatLKR(payments_balance_check.diff_cents)}</span>
            </div>
          </div>
        </div>

        {/* 2. Items Balance Check */}
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center space-x-1">
              <TrendingDown className="w-3.5 h-3.5" />
              <span>Lines vs Bill</span>
            </span>
            {items_balance_check.passed ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                PASSED
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300">
                FAILED
              </span>
            )}
          </div>
          <div className="text-xs text-slate-700 dark:text-slate-300 space-y-0.5 font-mono">
            <div className="flex justify-between">
              <span className="text-slate-400 dark:text-slate-500">Line Totals:</span>
              <span>{formatLKR(items_balance_check.sum_line_totals_cents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 dark:text-slate-500">Bill Totals:</span>
              <span>{formatLKR(items_balance_check.sum_sales_cents)}</span>
            </div>
            <div
              className={`flex justify-between font-bold border-t border-slate-100 dark:border-slate-800 pt-0.5 ${
                items_balance_check.diff_cents === 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              <span>Variance:</span>
              <span>{formatLKR(items_balance_check.diff_cents)}</span>
            </div>
          </div>
        </div>

        {/* 3. Stock Movements Invariant */}
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center space-x-1">
              <Boxes className="w-3.5 h-3.5" />
              <span>Stock Movements</span>
            </span>
            {stock_movements_check.passed ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                PASSED
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300">
                {stock_movements_check.mismatched_products_count} MISMATCH
              </span>
            )}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400">
            {stock_movements_check.passed ? (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">
                Sum of stock movements matches physical stock_qty across all products.
              </p>
            ) : (
              <div className="text-[10px] text-rose-700 dark:text-rose-400 max-h-16 overflow-y-auto font-mono space-y-0.5">
                {stock_movements_check.details.slice(0, 2).map((d) => (
                  <div key={d.product_id} className="truncate">
                    {d.sku}: curr {d.current_stock} != calc {d.calculated_stock}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 4. Gapless Sequence Continuity */}
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center space-x-1">
              <FileDigit className="w-3.5 h-3.5" />
              <span>Bill Sequence</span>
            </span>
            {bill_sequence_check.passed ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                GAPLESS
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300">
                {bill_sequence_check.missing_bills_count} GAPS
              </span>
            )}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400">
            {bill_sequence_check.passed ? (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">
                WWL bill sequence numbers are 100% gapless with no missing counter bills.
              </p>
            ) : (
              <div className="text-[10px] text-rose-700 dark:text-rose-400 max-h-16 overflow-y-auto font-mono">
                {bill_sequence_check.gaps.map((g, idx) => (
                  <div key={idx} className="truncate">
                    Date {g.date}: missing {g.missing_count} bills
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

