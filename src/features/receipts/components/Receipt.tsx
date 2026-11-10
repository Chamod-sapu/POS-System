import React from 'react';
import { Bill, PaperWidth } from '../types';
import { formatLKR } from '../../../lib/money';
import { maskPhoneNumber } from '../lib/maskPhone';
import { formatReceiptDate } from '../lib/formatPlainText';
import { Code128Barcode } from '../lib/barcode';

export interface ReceiptProps {
  bill: Bill;
  paperWidth?: PaperWidth;
  className?: string;
}

/**
 * Thermal Receipt Component
 * Renders the bill strictly from the database bill JSON snapshot.
 * Never recalculates money amounts; only formats integer cents.
 */
export const Receipt: React.FC<ReceiptProps> = ({
  bill,
  paperWidth = '80mm',
  className = '',
}) => {
  const isDuplicate = Boolean(bill.is_duplicate || bill.print_count >= 1);
  const printableWidthStyle = paperWidth === '58mm' ? 'w-[48mm] max-w-[48mm]' : 'w-[72mm] max-w-[72mm]';

  return (
    <div
      className={`bg-white text-black font-mono text-[11px] leading-tight select-none p-2 mx-auto border border-dashed border-slate-300 shadow-sm print:border-none print:shadow-none print:p-0 ${printableWidthStyle} ${className}`}
      style={{
        width: paperWidth === '58mm' ? '48mm' : '72mm',
      }}
    >
      {/* 1. DUPLICATE COPY at top when print_count >= 1 */}
      {isDuplicate && (
        <div className="text-center font-bold text-xs py-1 border-b border-dashed border-black mb-2 tracking-wide">
          *** DUPLICATE COPY ***
        </div>
      )}

      {/* 2. Shop Header (Bold, Centred) */}
      <div className="text-center space-y-0.5">
        <h1 className="text-sm font-black uppercase tracking-wider text-black">
          {bill.shop.name || 'Wewala Store'}
        </h1>
        {bill.shop.address && (
          <p className="text-[10px] text-black leading-tight">{bill.shop.address}</p>
        )}
        {bill.shop.phone && (
          <p className="text-[10px] text-black">Tel: {bill.shop.phone}</p>
        )}
        {bill.shop.vat_reg_no && (
          <p className="text-[10px] text-black">VAT Reg: {bill.shop.vat_reg_no}</p>
        )}
      </div>

      {/* 3. Dashed line */}
      <div className="my-1.5 border-t border-dashed border-black" />

      {/* 4. Bill Metadata */}
      <div className="space-y-0.5 text-[10px]">
        <div className="flex justify-between items-baseline">
          <span className="font-semibold">Bill No:</span>
          <span className="font-bold tabular-nums">{bill.bill_no}</span>
        </div>
        <div className="flex justify-between items-baseline">
          <span>Date:</span>
          <span className="tabular-nums">{formatReceiptDate(bill.date_time)}</span>
        </div>
        <div className="flex justify-between items-baseline">
          <span>Cashier:</span>
          <span>{bill.cashier?.name || 'Cashier'}</span>
        </div>
        {bill.customer && (
          <div className="flex justify-between items-baseline">
            <span>Customer:</span>
            <span className="text-right">
              {bill.customer.name && maskPhoneNumber(bill.customer.phone)
                ? `${bill.customer.name} (${maskPhoneNumber(bill.customer.phone)})`
                : maskPhoneNumber(bill.customer.phone) || bill.customer.name}
            </span>
          </div>
        )}
      </div>

      {/* 5. Dashed line */}
      <div className="my-1.5 border-t border-dashed border-black" />

      {/* 6. Column header (Item, Qty x Price, Total) */}
      <div className="flex justify-between items-baseline font-bold text-[10px] pb-1 border-b border-black">
        <span>Item</span>
        <span className="text-right">Qty x Price &nbsp; Total</span>
      </div>

      {/* 7. Line Items */}
      <div className="divide-y divide-dotted divide-slate-300 py-1 space-y-1">
        {bill.lines.map((line, idx) => {
          const formattedQty = Number.isInteger(line.quantity)
            ? `${line.quantity}`
            : `${line.quantity.toFixed(3).replace(/\.?0+$/, '')}`;

          return (
            <div key={`${line.product_id}-${idx}`} className="pt-1 first:pt-0">
              {/* Product name wrapping onto extra lines if long */}
              <div className="font-bold text-black break-words leading-tight">
                {line.name}
              </div>
              <div className="flex justify-between items-baseline tabular-nums text-[10px] mt-0.5">
                <span className="text-slate-800">
                  {formattedQty} {line.unit} x {formatLKR(line.unit_price_cents)}
                </span>
                <span className="font-bold text-black text-right ml-2">
                  {formatLKR(line.line_total_cents)}
                </span>
              </div>
              {/* Item discount line if present */}
              {line.line_discount_cents > 0 && (
                <div className="flex justify-between items-baseline text-[9px] text-slate-700 tabular-nums">
                  <span className="italic pl-2">Discount</span>
                  <span>-{formatLKR(line.line_discount_cents)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 8. Dashed line */}
      <div className="my-1.5 border-t border-dashed border-black" />

      {/* 9. Financial Totals */}
      <div className="space-y-0.5 text-[10px] tabular-nums">
        <div className="flex justify-between items-baseline">
          <span>Subtotal</span>
          <span>{formatLKR(bill.subtotal_cents)}</span>
        </div>

        {bill.line_discount_cents > 0 && (
          <div className="flex justify-between items-baseline text-slate-700">
            <span>Item Discounts</span>
            <span>-{formatLKR(bill.line_discount_cents)}</span>
          </div>
        )}

        {bill.bill_discount_cents > 0 && (
          <div className="flex justify-between items-baseline text-slate-700">
            <span>Bill Discount</span>
            <span>-{formatLKR(bill.bill_discount_cents)}</span>
          </div>
        )}

        {bill.tax && (
          <div className="flex justify-between items-baseline text-slate-700">
            <span>
              Tax ({bill.tax.rate_percent}% {bill.tax.mode === 'inclusive' ? 'incl.' : 'excl.'})
            </span>
            <span>{formatLKR(bill.tax.tax_cents)}</span>
          </div>
        )}

        {/* TOTAL in large bold */}
        <div className="flex justify-between items-baseline font-black text-xs pt-1 border-t border-black mt-1">
          <span className="tracking-wider">TOTAL</span>
          <span className="text-sm">{formatLKR(bill.total_cents)}</span>
        </div>
      </div>

      {/* 10. Payment Breakdown */}
      <div className="space-y-0.5 text-[10px] tabular-nums mt-1.5 pt-1 border-t border-dotted border-slate-400">
        {(bill.payments || []).map((p, idx) => (
          <div key={idx} className="flex justify-between items-baseline">
            <span className="capitalize">
              {p.method.replace('_', ' ')}
              {p.reference ? ` (${p.reference})` : ''}
            </span>
            <span>{formatLKR(p.amount_cents)}</span>
          </div>
        ))}
        <div className="flex justify-between items-baseline font-bold pt-0.5">
          <span>Paid</span>
          <span>{formatLKR(bill.paid_cents)}</span>
        </div>
        <div className="flex justify-between items-baseline font-bold">
          <span>Change</span>
          <span>{formatLKR(bill.change_cents)}</span>
        </div>
      </div>

      {/* 10b. Loyalty Points */}
      {bill.customer && (bill.customer.points_earned !== undefined || bill.customer.points_balance !== undefined) && (
        <div className="pt-1 mt-1 border-t border-dotted border-slate-400 space-y-0.5 text-[10px] tabular-nums">
          {bill.customer.points_earned !== undefined && bill.customer.points_earned > 0 && (
            <div className="flex justify-between items-baseline text-slate-800">
              <span>Loyalty Points Earned:</span>
              <span className="font-bold">+{bill.customer.points_earned}</span>
            </div>
          )}
          {bill.customer.points_balance !== undefined && (
            <div className="flex justify-between items-baseline text-slate-800">
              <span>Total Points Balance:</span>
              <span className="font-bold">{bill.customer.points_balance} pts</span>
            </div>
          )}
        </div>
      )}

      {/* 11. Dashed line */}
      <div className="my-2 border-t border-dashed border-black" />

      {/* 12. Footer text from settings */}
      <div className="text-center space-y-1 text-[10px]">
        {bill.shop.footer && (
          <p className="text-black leading-tight italic">{bill.shop.footer}</p>
        )}
        {/* 13. 'Thank you, please come again' */}
        <p className="font-bold tracking-wide">Thank you, please come again</p>

        {/* 14. Code128 barcode of the bill number */}
        <div className="py-1">
          <Code128Barcode
            value={bill.bill_no}
            height={32}
            barWidth={paperWidth === '58mm' ? 1.0 : 1.3}
            showText={true}
          />
        </div>
      </div>

      {/* 15. DUPLICATE COPY at bottom when print_count >= 1 */}
      {isDuplicate && (
        <div className="text-center font-bold text-xs py-1 border-t border-dashed border-black mt-2 tracking-wide">
          *** DUPLICATE COPY ***
        </div>
      )}

      {/* 10mm bottom whitespace for paper cutter */}
      <div className="h-[10mm]" />
    </div>
  );
};

