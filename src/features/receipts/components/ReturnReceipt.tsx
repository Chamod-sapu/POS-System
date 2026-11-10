import React from 'react';
import { PaperWidth } from '../types';
import { ReturnDetailSnapshot } from '../../sales/api/returns';
import { formatLKR } from '../../../lib/money';
import { maskPhoneNumber } from '../lib/maskPhone';
import { formatReceiptDate } from '../lib/formatPlainText';
import { Code128Barcode } from '../lib/barcode';

export interface ReturnReceiptProps {
  returnSnapshot: ReturnDetailSnapshot;
  paperWidth?: PaperWidth;
  className?: string;
}

/**
 * Thermal Return / Credit Note Component
 * Formatted specifically for 80mm and 58mm thermal receipt printers.
 */
export const ReturnReceipt: React.FC<ReturnReceiptProps> = ({
  returnSnapshot,
  paperWidth = '80mm',
  className = '',
}) => {
  const printableWidthStyle =
    paperWidth === '58mm' ? 'w-[48mm] max-w-[48mm]' : 'w-[72mm] max-w-[72mm]';

  return (
    <div
      className={`bg-white text-black font-mono text-[11px] leading-tight select-none p-2 mx-auto border border-dashed border-slate-300 shadow-sm print:border-none print:shadow-none print:p-0 ${printableWidthStyle} ${className}`}
      style={{
        width: paperWidth === '58mm' ? '48mm' : '72mm',
      }}
    >
      {/* 1. Header Banner */}
      <div className="text-center font-black text-xs py-1 border-b border-dashed border-black mb-1.5 tracking-wider">
        *** RETURN / CREDIT NOTE ***
      </div>

      {/* 2. Shop Details */}
      <div className="text-center space-y-0.5">
        <h1 className="text-sm font-black uppercase tracking-wider text-black">
          {returnSnapshot.shop?.name || 'Wewala Store'}
        </h1>
        {returnSnapshot.shop?.address && (
          <p className="text-[10px] text-black leading-tight">
            {returnSnapshot.shop.address}
          </p>
        )}
        {returnSnapshot.shop?.phone && (
          <p className="text-[10px] text-black">Tel: {returnSnapshot.shop.phone}</p>
        )}
      </div>

      {/* 3. Divider */}
      <div className="my-1.5 border-t border-dashed border-black" />

      {/* 4. Metadata */}
      <div className="space-y-0.5 text-[10px]">
        <div className="flex justify-between">
          <span className="font-bold">Return No:</span>
          <span className="font-bold">{returnSnapshot.return_number}</span>
        </div>
        <div className="flex justify-between">
          <span>Orig. Bill:</span>
          <span>#{returnSnapshot.bill_no}</span>
        </div>
        <div className="flex justify-between">
          <span>Date:</span>
          <span>{formatReceiptDate(returnSnapshot.created_at)}</span>
        </div>
        <div className="flex justify-between">
          <span>Staff:</span>
          <span>{returnSnapshot.cashier?.name || 'Staff'}</span>
        </div>
        {returnSnapshot.customer?.phone && (
          <div className="flex justify-between">
            <span>Customer:</span>
            <span>
              {returnSnapshot.customer.name
                ? `${returnSnapshot.customer.name} (${maskPhoneNumber(
                    returnSnapshot.customer.phone
                  )})`
                : maskPhoneNumber(returnSnapshot.customer.phone)}
            </span>
          </div>
        )}
      </div>

      {/* 5. Items Header */}
      <div className="my-1.5 border-t border-dashed border-black" />
      <div className="flex justify-between text-[10px] font-bold border-b border-dashed border-black pb-0.5">
        <span className="w-1/2">Item Returned</span>
        <span className="w-1/4 text-center">Qty</span>
        <span className="w-1/4 text-right">Refund</span>
      </div>

      {/* 6. Returned Lines */}
      <div className="space-y-1.5 pt-1">
        {returnSnapshot.lines.map((line, idx) => (
          <div key={idx} className="flex justify-between text-[10px]">
            <div className="w-1/2 break-words leading-tight pr-1">
              <span className="font-medium">{line.product_name}</span>
            </div>
            <div className="w-1/4 text-center">
              {line.returned_quantity} {line.unit}
            </div>
            <div className="w-1/4 text-right font-bold">
              {formatLKR(line.refund_cents)}
            </div>
          </div>
        ))}
      </div>

      {/* 7. Summary & Total */}
      <div className="my-1.5 border-t border-dashed border-black" />
      <div className="flex justify-between items-baseline py-1 text-xs font-black">
        <span className="uppercase">TOTAL REFUND</span>
        <span className="text-sm font-black">
          {formatLKR(returnSnapshot.total_refund_cents)}
        </span>
      </div>

      {/* 8. Refund Method & Inventory Status */}
      <div className="space-y-0.5 text-[10px] pt-0.5 border-t border-dashed border-black">
        <div className="flex justify-between">
          <span>Refund Method:</span>
          <span className="font-bold uppercase">
            {returnSnapshot.refund_method === 'cash' ? 'CASH' : 'STORE CREDIT'}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Stock Status:</span>
          <span className="font-bold">
            {returnSnapshot.restock ? 'RESTOCKED' : 'DAMAGED / SCRAP'}
          </span>
        </div>
        <div className="text-[10px] text-slate-700 italic pt-0.5">
          Reason: {returnSnapshot.reason}
        </div>
      </div>

      {/* 9. Barcode */}
      <div className="my-2 border-t border-dashed border-black" />
      <div className="flex flex-col items-center justify-center py-1">
        <Code128Barcode value={returnSnapshot.return_number} barWidth={1.2} height={28} />
      </div>

      {/* 10. Footer */}
      <div className="text-center text-[9px] text-slate-600 pt-1 space-y-0.5">
        <p className="font-bold">*** CUSTOMER COPY ***</p>
        <p>Authorized Return • Please retain for your records</p>
      </div>
    </div>
  );
};
