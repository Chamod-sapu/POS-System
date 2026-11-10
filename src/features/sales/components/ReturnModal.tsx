import React, { useState, useMemo } from 'react';
import { RotateCcw, AlertTriangle, CheckCircle2, PackageCheck, PackageX } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Bill } from '../../receipts/types';
import { createReturn, ReturnDetailSnapshot } from '../api/returns';
import { formatLKR } from '../../../lib/money';

export interface ReturnModalProps {
  isOpen: boolean;
  bill: Bill;
  onClose: () => void;
  onSuccess: (returnSnapshot: ReturnDetailSnapshot) => void;
}

export const ReturnModal: React.FC<ReturnModalProps> = ({
  isOpen,
  bill,
  onClose,
  onSuccess,
}) => {
  // Map of sale_item_id -> return quantity
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [restock, setRestock] = useState<boolean>(true);
  const [refundMethod, setRefundMethod] = useState<'cash' | 'store_credit'>('cash');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // In this bill, lines may already have been partially returned if status is 'partially_returned'.
  // But each line in bill.lines has quantity and line_total_cents.
  const handleQtyChange = (itemId: string, maxQty: number, val: string) => {
    const parsed = parseFloat(val);
    const qty = isNaN(parsed) || parsed < 0 ? 0 : Math.min(parsed, maxQty);
    setReturnQuantities((prev) => ({
      ...prev,
      [itemId]: qty,
    }));
  };

  // Cent-perfect line refund preview matching PostgreSQL round_half_up
  const lineRefundCalculations = useMemo(() => {
    const calcs: Record<string, number> = {};
    for (const line of bill.lines) {
      const qtyToReturn = returnQuantities[line.product_id] || 0;
      if (qtyToReturn <= 0) {
        calcs[line.product_id] = 0;
        continue;
      }

      if (qtyToReturn >= line.quantity) {
        // Full remaining return -> exact line total
        calcs[line.product_id] = line.line_total_cents;
      } else {
        // Partial return -> round_half_up(line_total_cents * qty / sold_qty)
        const exact = (line.line_total_cents * qtyToReturn) / line.quantity;
        calcs[line.product_id] = Math.round(exact);
      }
    }
    return calcs;
  }, [bill.lines, returnQuantities]);

  const totalRefundCents = useMemo(() => {
    return Object.values(lineRefundCalculations).reduce((acc, c) => acc + c, 0);
  }, [lineRefundCalculations]);

  const hasSelectedItems = useMemo(() => {
    return Object.values(returnQuantities).some((q) => q > 0);
  }, [returnQuantities]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!hasSelectedItems) {
      setError('Please select at least one item and quantity to return.');
      return;
    }

    if (!reason.trim() || reason.trim().length < 3) {
      setError('A descriptive return reason is required (minimum 3 characters).');
      return;
    }

    // Build items payload
    // Note: the RPC expects [{ sale_item_id, quantity }]
    // Here line.product_id or we match by line product_id
    const itemsPayload = bill.lines
      .filter((line) => (returnQuantities[line.product_id] || 0) > 0)
      .map((line) => ({
        sale_item_id: line.product_id, // Our RPC matches on sale_items id or product_id
        quantity: returnQuantities[line.product_id] || 0,
      }));

    setIsSubmitting(true);
    setError(null);

    try {
      const returnSnapshot = await createReturn(
        bill.id,
        itemsPayload,
        reason.trim(),
        refundMethod,
        restock
      );
      onSuccess(returnSnapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-6">
        <div className="p-5 border-b border-slate-100 flex items-center space-x-3 bg-slate-50/50">
          <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center flex-shrink-0">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Process Customer Return</h3>
            <p className="text-xs text-slate-500">
              Bill #{bill.bill_no} • Issue credit note and optionally restock products
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium">
              {error}
            </div>
          )}

          {/* Items Return Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Purchased Line Items
              </label>
              <span className="text-[11px] text-slate-500">
                Specify quantities customer is returning
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Item / SKU</th>
                    <th className="py-2.5 px-3 text-right">Sold Qty</th>
                    <th className="py-2.5 px-3 text-right">Line Total</th>
                    <th className="py-2.5 px-3 text-center w-28">Return Qty</th>
                    <th className="py-2.5 px-3 text-right">Est. Refund</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {bill.lines.map((line) => {
                    const currentReturnQty = returnQuantities[line.product_id] || 0;
                    const lineRefund = lineRefundCalculations[line.product_id] || 0;
                    return (
                      <tr key={line.product_id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{line.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{line.sku}</div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {line.quantity} {line.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold">
                          {formatLKR(line.line_total_cents)}
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="number"
                            min="0"
                            max={line.quantity}
                            step={line.unit === 'kg' || line.unit === 'g' || line.unit === 'l' ? '0.001' : '1'}
                            value={currentReturnQty === 0 ? '' : currentReturnQty}
                            placeholder="0"
                            onChange={(e) =>
                              handleQtyChange(line.product_id, line.quantity, e.target.value)
                            }
                            className="w-full text-center py-1 bg-white border border-slate-300 rounded-lg font-mono font-bold text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-purple-700">
                          {formatLKR(lineRefund)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Refund Method & Inventory Disposition */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                Refund Payment Method
              </label>
              <select
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value as 'cash' | 'store_credit')}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="cash">Cash (Dispensed from Register Drawer)</option>
                <option value="store_credit">Store Credit (Customer Account)</option>
              </select>
              <p className="text-[10px] text-slate-500 mt-1">
                {refundMethod === 'cash'
                  ? 'Will automatically reduce expected cash for the active shift.'
                  : 'Customer phone profile must exist to accumulate store credit.'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                Inventory Disposition
              </label>
              <div className="space-y-2">
                <label className="flex items-center space-x-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="restock"
                    checked={restock === true}
                    onChange={() => setRestock(true)}
                    className="text-purple-600 focus:ring-purple-500"
                  />
                  <span className="font-semibold text-slate-800 flex items-center space-x-1">
                    <PackageCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Restock to Shelves & Original Batches</span>
                  </span>
                </label>
                <label className="flex items-center space-x-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="restock"
                    checked={restock === false}
                    onChange={() => setRestock(false)}
                    className="text-purple-600 focus:ring-purple-500"
                  />
                  <span className="font-semibold text-slate-800 flex items-center space-x-1">
                    <PackageX className="w-3.5 h-3.5 text-rose-600" />
                    <span>Damaged / Expired / Scrap (Do NOT Restock)</span>
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Mandatory Reason */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Return Reason (Mandatory)
            </label>
            <textarea
              rows={2}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Customer bought wrong size, packaging damaged, requested exchange..."
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Total Refund Banner */}
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-purple-700">
                Calculated Total Refund
              </div>
              <div className="text-xl font-black font-mono text-purple-950 mt-0.5">
                {formatLKR(totalRefundCents)}
              </div>
            </div>
            <div className="text-right text-[11px] text-purple-800">
              <div>Refund Method: <span className="font-bold uppercase">{refundMethod}</span></div>
              <div>Action: <span className="font-bold">{restock ? 'Restocking' : 'Scrapping'}</span></div>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!hasSelectedItems}
              isLoading={isSubmitting}
              leftIcon={<RotateCcw className="w-4 h-4" />}
            >
              Issue Return & Credit Note
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

