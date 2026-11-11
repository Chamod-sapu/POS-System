import React from 'react';
import { PaperWidth } from '../types';
import { XReportData, ZReportData } from '../../shifts/api/shifts';
import { formatLKR } from '../../../lib/money';
import { formatReceiptDate } from '../lib/formatPlainText';

export interface ShiftReportReceiptProps {
  data: XReportData | ZReportData;
  shopName?: string;
  paperWidth?: PaperWidth;
  className?: string;
}

/**
 * Thermal Shift Report Component
 * Renders compact, auditable X-Reports (mid-shift) and Z-Reports (shift close).
 */
export const ShiftReportReceipt: React.FC<ShiftReportReceiptProps> = ({
  data,
  shopName = 'Wewala Store',
  paperWidth = '80mm',
  className = '',
}) => {
  if (!data) return null;

  const isZReport = data.report_type === 'Z_REPORT';
  const zData = isZReport ? (data as ZReportData) : null;
  const xData = !isZReport ? (data as XReportData) : null;

  const safeCents = (v: unknown): number => {
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string') {
      const parsed = Number(v);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return 0;
  };

  const printableWidthStyle =
    paperWidth === '58mm' ? 'w-[48mm] max-w-[48mm]' : 'w-[72mm] max-w-[72mm]';

  const diffCents = safeCents(zData?.difference_cents);
  const changeGiven = safeCents(data.change_given_cents);
  const netCash = safeCents(data.net_cash_sales_cents ?? (safeCents(data.cash_sales_cents) - changeGiven));

  return (
    <div
      className={`bg-white text-black font-mono text-[11px] leading-tight select-none p-2 mx-auto border border-dashed border-slate-300 shadow-sm print:border-none print:shadow-none print:p-0 ${printableWidthStyle} ${className}`}
      style={{
        width: paperWidth === '58mm' ? '48mm' : '72mm',
      }}
    >
      {/* 1. Report Title Header */}
      <div className="text-center font-black text-xs py-1 border-b border-dashed border-black mb-1.5 tracking-wider">
        {isZReport ? '*** Z REPORT (END OF SHIFT) ***' : '*** X REPORT (MID-SHIFT AUDIT) ***'}
      </div>

      {/* 2. Shop Name */}
      <div className="text-center space-y-0.5">
        <h1 className="text-sm font-black uppercase tracking-wider text-black">
          {shopName}
        </h1>
        <p className="text-[10px] text-black">POS Cash Drawer Audit</p>
      </div>

      {/* 3. Divider */}
      <div className="my-1.5 border-t border-dashed border-black" />

      {/* 4. Shift & Cashier Meta */}
      <div className="space-y-0.5 text-[10px]">
        <div className="flex justify-between">
          <span className="font-bold">Shift Ref:</span>
          <span className="font-mono">{data.shift_id ? `${data.shift_id.slice(0, 8)}...` : 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span>Terminal:</span>
          <span>{data.terminal_name || 'Main Terminal'}</span>
        </div>
        <div className="flex justify-between">
          <span>Cashier:</span>
          <span className="font-bold">{data.cashier_name || 'Staff Member'}</span>
        </div>
        <div className="flex justify-between">
          <span>Opened At:</span>
          <span>{formatReceiptDate(data.opened_at || new Date().toISOString())}</span>
        </div>
        {isZReport ? (
          <div className="flex justify-between font-bold">
            <span>Closed At:</span>
            <span>{formatReceiptDate(zData?.closed_at || new Date().toISOString())}</span>
          </div>
        ) : (
          <div className="flex justify-between">
            <span>Audit As Of:</span>
            <span>{formatReceiptDate(xData?.as_of || (data as Record<string, any>)?.generated_at || new Date().toISOString())}</span>
          </div>
        )}
      </div>

      {/* 5. Financial Audit Breakdown */}
      <div className="my-1.5 border-t border-dashed border-black" />
      <div className="text-[10px] font-bold pb-1 uppercase tracking-wider text-center">
        Drawer Cash Reconciliation
      </div>

      <div className="space-y-1 text-[10px]">
        <div className="flex justify-between">
          <span>Opening Float:</span>
          <span>{formatLKR(safeCents(data.opening_float_cents))}</span>
        </div>
        <div className="flex justify-between">
          <span>Gross Cash Sales:</span>
          <span>+{formatLKR(safeCents(data.cash_sales_cents))}</span>
        </div>
        {changeGiven > 0 && (
          <div className="flex justify-between text-slate-600">
            <span>- Change Given:</span>
            <span>-{formatLKR(changeGiven)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold border-t border-dotted border-black/40 pt-0.5">
          <span>Net Cash Collected:</span>
          <span>{formatLKR(netCash)}</span>
        </div>

        {xData && safeCents(xData.non_cash_sales_cents) > 0 && (
          <div className="flex justify-between text-slate-600">
            <span>Card / Non-Cash Sales:</span>
            <span>{formatLKR(safeCents(xData.non_cash_sales_cents))}</span>
          </div>
        )}

        <div className="flex justify-between text-rose-800">
          <span>- Cash Refunds:</span>
          <span>-{formatLKR(safeCents(data.cash_refunds_cents))}</span>
        </div>
        <div className="flex justify-between text-emerald-800">
          <span>+ Cash In (Float additions):</span>
          <span>+{formatLKR(safeCents(data.cash_in_cents))}</span>
        </div>
        <div className="flex justify-between text-rose-800">
          <span>- Cash Out (Drops/Expenses):</span>
          <span>-{formatLKR(safeCents(data.cash_out_cents))}</span>
        </div>
      </div>

      {/* 6. Expected Drawer Balance */}
      <div className="my-1.5 border-t border-dashed border-black" />
      <div className="flex justify-between items-baseline text-xs font-black py-0.5">
        <span className="uppercase">EXPECTED CASH:</span>
        <span className="text-sm font-black">{formatLKR(safeCents(data.expected_cash_cents))}</span>
      </div>

      {/* 7. Z-Report Specific Count & Variance */}
      {isZReport && (
        <div className="mt-1 pt-1 border-t border-dashed border-black space-y-1 text-[11px]">
          <div className="flex justify-between font-bold">
            <span>COUNTED CASH:</span>
            <span>{formatLKR(safeCents(zData?.counted_cash_cents))}</span>
          </div>
          <div
            className={`flex justify-between font-black text-xs p-1 rounded ${
              diffCents === 0
                ? 'bg-emerald-50 text-emerald-900'
                : diffCents > 0
                ? 'bg-blue-50 text-blue-900'
                : 'bg-rose-50 text-rose-900'
            }`}
          >
            <span>
              {diffCents === 0
                ? 'DRAWER BALANCED:'
                : diffCents > 0
                ? 'CASH OVER:'
                : 'CASH SHORT:'}
            </span>
            <span>
              {diffCents > 0 ? '+' : ''}
              {formatLKR(diffCents)}
            </span>
          </div>

          {zData?.note && (
            <div className="text-[10px] text-slate-800 italic pt-1 border-t border-dotted border-black/40">
              <span className="font-bold not-italic">Discrepancy Note: </span>
              {zData.note}
            </div>
          )}
        </div>
      )}

      {/* 8. Footer */}
      <div className="my-2 border-t border-dashed border-black" />
      <div className="text-center text-[9px] text-slate-600 space-y-0.5">
        <p className="font-bold">
          {isZReport ? 'FINAL DRAWER AUDIT COMPLETE' : 'DRAWER CONTINUES ACTIVE'}
        </p>
        <p>Manager & Cashier Signatures Required</p>
        <div className="flex justify-between pt-4 pb-1 text-[9px]">
          <div className="border-t border-slate-400 w-24 text-center">Cashier</div>
          <div className="border-t border-slate-400 w-24 text-center">Manager</div>
        </div>
      </div>
    </div>
  );
};

