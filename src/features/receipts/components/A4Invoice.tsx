import React from 'react';
import { Bill } from '../types';
import { formatLKR } from '../../../lib/money';
import { maskPhoneNumber } from '../lib/maskPhone';
import { formatReceiptDate } from '../lib/formatPlainText';
import { Code128Barcode } from '../lib/barcode';

export interface A4InvoiceProps {
  bill: Bill;
  className?: string;
}

/**
 * A4 Retail Tax Invoice Component for corporate and business customer printing.
 */
export const A4Invoice: React.FC<A4InvoiceProps> = ({ bill, className = '' }) => {
  const isDuplicate = Boolean(bill.is_duplicate || bill.print_count >= 1);

  return (
    <div
      className={`bg-white text-slate-900 p-8 max-w-[210mm] min-h-[297mm] mx-auto border border-slate-200 shadow-sm print:border-none print:shadow-none print:p-0 print:m-0 font-sans ${className}`}
    >
      {/* Header with store identity and invoice meta */}
      <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-slate-950">
            {bill.shop.name || 'Wewala Store'}
          </h1>
          <p className="text-xs text-slate-600 mt-1 max-w-sm leading-relaxed">
            {bill.shop.address || 'Wewala, Sri Lanka'}
          </p>
          <div className="text-xs text-slate-600 mt-1 space-x-3">
            {bill.shop.phone && <span>Tel: {bill.shop.phone}</span>}
            {bill.shop.vat_reg_no && <span>VAT Reg No: {bill.shop.vat_reg_no}</span>}
          </div>
        </div>

        <div className="text-right">
          <div className="text-xl font-black text-slate-900 uppercase tracking-wider">
            TAX INVOICE
          </div>
          {isDuplicate && (
            <div className="inline-block bg-amber-100 text-amber-800 text-[11px] font-bold px-2 py-0.5 rounded border border-amber-300 mt-1">
              DUPLICATE COPY
            </div>
          )}
          <div className="mt-2 text-xs text-slate-700 space-y-0.5">
            <div>
              <span className="font-semibold text-slate-500">Invoice No: </span>
              <span className="font-mono font-bold text-slate-950">{bill.bill_no}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-500">Date: </span>
              <span className="tabular-nums">{formatReceiptDate(bill.date_time)}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-500">Cashier: </span>
              <span>{bill.cashier?.name || 'Cashier'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bill To Customer Information */}
      <div className="grid grid-cols-2 gap-6 my-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <div>
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Billed To
          </span>
          <div className="font-bold text-sm text-slate-900">
            {bill.customer?.name || 'Walk-in Retail Customer'}
          </div>
          {bill.customer?.phone && (
            <div className="text-xs text-slate-600 mt-0.5 font-mono">
              Phone: {maskPhoneNumber(bill.customer.phone)}
            </div>
          )}
        </div>
        <div className="text-right">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Payment Status
          </span>
          <span className="inline-block bg-emerald-100 text-emerald-800 text-xs font-black px-2.5 py-1 rounded-full border border-emerald-300">
            FULLY SETTLED
          </span>
        </div>
      </div>

      {/* Invoice Line Items Table */}
      <table className="w-full text-xs text-left border-collapse">
        <thead>
          <tr className="border-b-2 border-slate-300 text-slate-500 font-bold uppercase text-[10px]">
            <th className="py-2 w-8 text-center">#</th>
            <th className="py-2">Item Description</th>
            <th className="py-2 text-center w-16">Unit</th>
            <th className="py-2 text-right w-20">Qty</th>
            <th className="py-2 text-right w-24">Unit Price</th>
            <th className="py-2 text-right w-20">Discount</th>
            <th className="py-2 text-right w-28">Total (LKR)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {bill.lines.map((line, idx) => {
            const formattedQty = Number.isInteger(line.quantity)
              ? `${line.quantity}`
              : `${line.quantity.toFixed(3).replace(/\.?0+$/, '')}`;

            return (
              <tr key={idx} className="hover:bg-slate-50/50">
                <td className="py-2.5 text-center text-slate-400 font-mono">{idx + 1}</td>
                <td className="py-2.5">
                  <div className="font-semibold text-slate-900">{line.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono">SKU: {line.sku}</div>
                </td>
                <td className="py-2.5 text-center text-slate-600">{line.unit}</td>
                <td className="py-2.5 text-right font-mono tabular-nums">{formattedQty}</td>
                <td className="py-2.5 text-right font-mono tabular-nums">
                  {formatLKR(line.unit_price_cents)}
                </td>
                <td className="py-2.5 text-right font-mono tabular-nums text-slate-600">
                  {line.line_discount_cents > 0 ? `-${formatLKR(line.line_discount_cents)}` : '-'}
                </td>
                <td className="py-2.5 text-right font-mono font-bold tabular-nums text-slate-950">
                  {formatLKR(line.line_total_cents)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals & Payments Summary Breakdown */}
      <div className="mt-6 pt-4 border-t-2 border-slate-300 flex justify-between items-start">
        {/* Payment Methods breakdown */}
        <div className="w-1/2 space-y-2 pr-6">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Payment Breakdown
          </div>
          <div className="space-y-1 text-xs">
            {(bill.payments || []).map((p, idx) => (
              <div key={idx} className="flex justify-between py-1 border-b border-slate-100">
                <span className="capitalize font-medium text-slate-700">
                  {p.method.replace('_', ' ')}
                  {p.reference ? ` (${p.reference})` : ''}
                </span>
                <span className="font-mono tabular-nums font-semibold">
                  {formatLKR(p.amount_cents)}
                </span>
              </div>
            ))}
            <div className="flex justify-between pt-1 text-slate-900 font-bold">
              <span>Total Received</span>
              <span className="font-mono">{formatLKR(bill.paid_cents)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Change Tendered</span>
              <span className="font-mono">{formatLKR(bill.change_cents)}</span>
            </div>
          </div>
        </div>

        {/* Financial calculation totals */}
        <div className="w-1/2 max-w-xs space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-700">
            <span>Subtotal</span>
            <span className="font-mono tabular-nums font-semibold">
              {formatLKR(bill.subtotal_cents)}
            </span>
          </div>

          {bill.line_discount_cents > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Line Item Discounts</span>
              <span className="font-mono tabular-nums">-{formatLKR(bill.line_discount_cents)}</span>
            </div>
          )}

          {bill.bill_discount_cents > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Bill Level Discount</span>
              <span className="font-mono tabular-nums">-{formatLKR(bill.bill_discount_cents)}</span>
            </div>
          )}

          {bill.tax && (
            <div className="flex justify-between text-slate-600">
              <span>
                VAT Tax ({bill.tax.rate_percent}%{' '}
                {bill.tax.mode === 'inclusive' ? 'Inclusive' : 'Exclusive'})
              </span>
              <span className="font-mono tabular-nums">{formatLKR(bill.tax.tax_cents)}</span>
            </div>
          )}

          <div className="flex justify-between font-black text-base pt-3 border-t-2 border-slate-900 text-slate-950">
            <span>GRAND TOTAL</span>
            <span className="font-mono text-emerald-800">{formatLKR(bill.total_cents)}</span>
          </div>
        </div>
      </div>

      {/* Barcode & Footer Notice */}
      <div className="mt-12 pt-6 border-t border-slate-200 flex justify-between items-end text-xs text-slate-500">
        <div>
          {bill.shop.footer && <p className="mb-2 italic">{bill.shop.footer}</p>}
          <p className="font-medium text-slate-700">Thank you for shopping with Wewala Store!</p>
          <p className="text-[10px] text-slate-400 mt-1">
            Goods sold are returnable within 7 days with this original receipt.
          </p>
        </div>

        <div className="text-center">
          <Code128Barcode value={bill.bill_no} height={36} barWidth={1.2} showText={true} />
        </div>
      </div>

      {/* Signature lines for formal invoice */}
      <div className="mt-12 pt-8 grid grid-cols-2 gap-12 text-center text-xs text-slate-600 border-t border-dashed border-slate-300">
        <div>
          <div className="border-t border-slate-400 w-48 mx-auto mb-1"></div>
          <span>Authorized Cashier Signature</span>
        </div>
        <div>
          <div className="border-t border-slate-400 w-48 mx-auto mb-1"></div>
          <span>Customer Acceptance</span>
        </div>
      </div>
    </div>
  );
};

