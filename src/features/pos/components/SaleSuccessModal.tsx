import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Printer, ArrowRight, AlertOctagon, FileText, MessageSquare } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { SaleCheckoutResult } from '../types';
import { Money } from '../../../components/ui/Money';
import { maskPhoneNumber } from '../../receipts/lib/maskPhone';
import { verifyBill, logBillIntegrityFailure } from '../../receipts/lib/verifyBill';
import { printBill } from '../../receipts/lib/printerAdapter';
import { getPrinterSettings } from '../../receipts/lib/printerSettings';
import { recordBillPrinted } from '../../sales/api/sales';
import { fetchSaleSms, subscribeToSaleSms, SmsOutboxRow, SmsStatus } from '../../sms/api/sms';
import { SmsStatusBadge } from '../../sms/components/SmsStatusBadge';
import { broadcastToCustomerDisplay } from '../lib/customerDisplayBroadcast';

export interface SaleSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: SaleCheckoutResult | null;
}

export const SaleSuccessModal: React.FC<SaleSuccessModalProps> = ({
  isOpen,
  onClose,
  sale,
}) => {
  const nextCustomerBtnRef = useRef<HTMLButtonElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printCount, setPrintCount] = useState(0);
  const [printError, setPrintError] = useState<string | null>(null);
  const [smsRow, setSmsRow] = useState<SmsOutboxRow | null>(null);
  const [smsStatus, setSmsStatus] = useState<SmsStatus | 'not_sent'>('not_sent');

  // Bill integrity verification
  const verification = sale ? verifyBill(sale) : { valid: true };
  const hasIntegrityError = !verification.valid;

  // Real-time SMS status subscription & Customer Display Broadcast
  useEffect(() => {
    if (!isOpen || !sale) return;

    broadcastToCustomerDisplay({
      type: 'SALE_COMPLETED',
      billNo: sale.bill_no,
      totalCents: sale.total_cents,
      changeDueCents: sale.change_cents,
    });

    if (!sale.customer?.phone) {
      setSmsStatus('not_sent');
      setSmsRow(null);
      return;
    }

    setSmsStatus('pending');

    // Fetch initial row
    fetchSaleSms(sale.id).then((initial) => {
      if (initial) {
        setSmsRow(initial);
        setSmsStatus(initial.status);
      }
    });

    // Subscribe to live Realtime updates
    const unsubscribe = subscribeToSaleSms(sale.id, (updated) => {
      setSmsRow(updated);
      setSmsStatus(updated.status);
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen, sale]);

  // Reset and auto-print effect
  useEffect(() => {
    if (isOpen && sale) {
      setPrintCount(sale.print_count || 0);
      setPrintError(null);

      if (hasIntegrityError) {
        logBillIntegrityFailure(
          sale,
          verification.error || 'Bill totals mismatch on checkout'
        );
        return;
      }

      // Check auto-print preference
      const settings = getPrinterSettings();
      if (settings.autoPrint) {
        setIsPrinting(true);

        printBill(sale, {
          paperWidth: settings.paperWidth,
          copies: settings.copies,
          openDrawer: settings.drawerOnCash,
        })
          .then(async (res) => {
            if (res.success) {
              try {
                const record = await recordBillPrinted(sale.id);
                setPrintCount(record.print_count);
              } catch {
                setPrintCount((prev) => prev + 1);
              }
            } else {
              setPrintError(res.error || 'Auto-print was aborted');
            }
          })
          .catch((err) => {
            setPrintError(err instanceof Error ? err.message : String(err));
          })
          .finally(() => {
            setIsPrinting(false);
          });
      }

      setTimeout(() => {
        nextCustomerBtnRef.current?.focus();
      }, 100);
    }
  }, [isOpen, sale, hasIntegrityError, verification.error]);

  if (!isOpen || !sale) return null;

  const handleManualPrint = async () => {
    if (hasIntegrityError) return;

    setIsPrinting(true);
    setPrintError(null);

    try {
      const settings = getPrinterSettings();
      const res = await printBill(sale, {
        paperWidth: settings.paperWidth,
        copies: settings.copies,
        openDrawer: settings.drawerOnCash,
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to print receipt.');
      }

      try {
        const record = await recordBillPrinted(sale.id);
        setPrintCount(record.print_count);
      } catch {
        setPrintCount((prev) => prev + 1);
      }
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsPrinting(false);
    }
  };

  const handlePrintA4 = () => {
    window.print();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Sale Completed Successfully" size="md">
      <div className="space-y-5 text-center">
        {/* Integrity Alert if corrupted */}
        {hasIntegrityError ? (
          <div className="p-4 bg-rose-50 dark:bg-rose-950/60 border-2 border-rose-400 dark:border-rose-800 rounded-xl text-left flex items-start space-x-3 text-rose-900 dark:text-rose-200">
            <AlertOctagon className="w-6 h-6 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-black text-sm uppercase tracking-wide text-rose-700 dark:text-rose-300">
                Bill totals mismatch, do not hand to customer
              </h4>
              <p className="text-xs font-semibold text-rose-800 dark:text-rose-200 mt-1">
                {verification.error || 'Arithmetic checksum mismatch detected in bill structure.'}
              </p>
              <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">
                Printing has been locked to protect financial accuracy.
              </p>
            </div>
          </div>
        ) : (
          <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-raised transition-subtle animate-in zoom-in-75 duration-200">
            <CheckCircle2 className="w-10 h-10" />
          </div>
        )}

        <div>
          <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Payment Confirmed</h3>
          <p className="font-mono text-sm text-slate-500 dark:text-slate-400 font-bold mt-1">
            Bill No: <span className="text-brand-600 dark:text-brand-400 font-bold">{sale.bill_no}</span>
          </p>
          {printCount >= 1 && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-black rounded-full uppercase tracking-wider">
              *** DUPLICATE COPY ***
            </div>
          )}
        </div>

        {/* Change Due Highlight Card */}
        <div className="p-4 bg-slate-900 text-white rounded-2xl shadow-subtle border border-slate-800">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-bold">
            Change Due to Customer
          </div>
          <div className="mt-1">
            <Money size="hero" cents={sale.change_cents} className="text-emerald-400" />
          </div>
          <div className="text-xs text-slate-400 mt-2 flex justify-center items-center space-x-3">
            <span>Bill: <Money size="sm" cents={sale.total_cents} className="text-slate-200" /></span>
            <span>•</span>
            <span>Paid: <Money size="sm" cents={sale.paid_cents} className="text-slate-200" /></span>
          </div>
        </div>

        {/* Print Feedback Notification */}
        {printError && (
          <div className="p-2.5 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 rounded-xl text-xs text-left shadow-subtle">
            <span className="font-bold">Printer Notice: </span>
            <span>{printError} (You can reprint below).</span>
          </div>
        )}

        {/* Print Action Buttons */}
        <div className="flex items-center justify-center space-x-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            disabled={hasIntegrityError}
            isLoading={isPrinting}
            leftIcon={<Printer className="w-4 h-4" />}
            onClick={handleManualPrint}
          >
            {printCount > 0 ? `Print Again (${printCount})` : 'Print Receipt'}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            leftIcon={<FileText className="w-4 h-4" />}
            onClick={handlePrintA4}
            className="text-slate-600 dark:text-slate-300"
          >
            A4 Invoice
          </Button>
        </div>

        {/* Real-time Customer SMS Notification Status */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between text-xs shadow-subtle">
          <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-300">
            <MessageSquare className="w-4 h-4 text-brand-600 dark:text-brand-400 flex-shrink-0" />
            <span className="font-medium">
              {sale.customer?.phone
                ? `SMS Receipt to ${maskPhoneNumber(sale.customer.phone)}`
                : 'Customer SMS Receipt'}
            </span>
          </div>
          <SmsStatusBadge status={smsStatus} attempts={smsRow?.attempts} />
        </div>

        {/* Next Customer Button */}
        <div className="pt-2">
          <Button
            ref={nextCustomerBtnRef}
            variant="primary"
            size="lg"
            onClick={onClose}
            rightIcon={<ArrowRight className="w-5 h-5" />}
            className="w-full font-bold text-base py-3.5 shadow-raised flex justify-center items-center"
          >
            Next Customer (Enter / Esc)
          </Button>
        </div>
      </div>
    </Modal>
  );
};
