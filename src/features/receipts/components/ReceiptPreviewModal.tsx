import React, { useState } from 'react';
import { Printer, AlertOctagon, FileText, CheckCircle2 } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Bill, PaperWidth } from '../types';
import { Receipt } from './Receipt';
import { A4Invoice } from './A4Invoice';
import { verifyBill } from '../lib/verifyBill';
import { printBill, getPrinterAdapter } from '../lib/printerAdapter';
import { getPrinterSettings } from '../lib/printerSettings';

export interface ReceiptPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  bill: Bill | null;
  onPrinted?: () => void;
}

export const ReceiptPreviewModal: React.FC<ReceiptPreviewModalProps> = ({
  isOpen,
  onClose,
  bill,
  onPrinted,
}) => {
  const [viewMode, setViewMode] = useState<'80mm' | '58mm' | 'a4'>('80mm');
  const [isPrinting, setIsPrinting] = useState(false);
  const [printSuccess, setPrintSuccess] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  if (!bill) return null;

  // Bill integrity verification check
  const verification = verifyBill(bill);
  const hasIntegrityError = !verification.valid;

  const handlePrint = async () => {
    if (hasIntegrityError) return;

    setIsPrinting(true);
    setPrintError(null);
    setPrintSuccess(false);

    try {
      if (viewMode === 'a4') {
        window.print();
        setPrintSuccess(true);
        onPrinted?.();
      } else {
        const settings = getPrinterSettings();
        const width: PaperWidth = viewMode === '58mm' ? '58mm' : '80mm';
        const res = await printBill(bill, {
          paperWidth: width,
          copies: settings.copies,
          openDrawer: settings.drawerOnCash,
        });

        if (!res.success) {
          throw new Error(res.error || 'Failed to communicate with printer.');
        }

        setPrintSuccess(true);
        onPrinted?.();
      }
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDrawerKick = async () => {
    try {
      const adapter = getPrinterAdapter();
      await adapter.openCashDrawer?.();
    } catch (err) {
      console.warn('Could not trigger drawer:', err);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Bill #${bill.bill_no}`}
      size={viewMode === 'a4' ? 'xl' : 'md'}
    >
      <div className="space-y-4">
        {/* Integrity Alert Banner */}
        {hasIntegrityError && (
          <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-xl flex items-start space-x-3 text-rose-900">
            <AlertOctagon className="w-6 h-6 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-black text-sm uppercase tracking-wide text-rose-700">
                Security Alert: Bill Totals Mismatch
              </h4>
              <p className="text-xs font-bold text-rose-800 mt-0.5">
                {verification.error || 'Bill totals mismatch, do not hand to customer.'}
              </p>
              <p className="text-[11px] text-rose-600 mt-1">
                Printing has been locked for this transaction. An automated incident entry has been
                dispatched to the tamper-evident audit log.
              </p>
            </div>
          </div>
        )}

        {/* View Mode Switcher */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode('80mm')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                viewMode === '80mm'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              80mm Thermal
            </button>
            <button
              type="button"
              onClick={() => setViewMode('58mm')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                viewMode === '58mm'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              58mm Compact
            </button>
            <button
              type="button"
              onClick={() => setViewMode('a4')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                viewMode === 'a4'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              A4 Tax Invoice
            </button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleDrawerKick}
            className="text-xs text-slate-600"
          >
            Open Drawer
          </Button>
        </div>

        {/* Preview Scroll Area */}
        <div className="max-h-[60vh] overflow-y-auto preview-canvas-dotgrid p-6 rounded-2xl flex justify-center border border-slate-200 dark:border-slate-800">
          {viewMode === 'a4' ? (
            <div className="w-full bg-white rounded-xl shadow-overlay p-4">
              <A4Invoice bill={bill} />
            </div>
          ) : (
            <div className="receipt-paper rounded-sm shadow-overlay">
              <Receipt bill={bill} paperWidth={viewMode} />
            </div>
          )}
        </div>

        {/* Status Messages */}
        {printSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center space-x-2 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>Receipt dispatched to printer queue successfully.</span>
          </div>
        )}

        {printError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold">
            {printError}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-3 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={hasIntegrityError}
            isLoading={isPrinting}
            leftIcon={viewMode === 'a4' ? <FileText className="w-4 h-4" /> : <Printer className="w-4 h-4" />}
            onClick={handlePrint}
          >
            {bill.print_count >= 1 ? 'Reprint (Duplicate)' : 'Print Receipt'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
