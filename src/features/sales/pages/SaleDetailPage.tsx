import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Printer,
  AlertOctagon,
  CheckCircle2,
  MessageSquare,
  RotateCcw,
  Ban,
  ShieldAlert,
  FileText,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Bill } from '../../receipts/types';
import { fetchBill, recordBillPrinted } from '../api/sales';
import { Receipt } from '../../receipts/components/Receipt';
import { A4Invoice } from '../../receipts/components/A4Invoice';
import { verifyBill } from '../../receipts/lib/verifyBill';
import { printBill } from '../../receipts/lib/printerAdapter';
import { getPrinterSettings } from '../../receipts/lib/printerSettings';
import { maskPhoneNumber } from '../../receipts/lib/maskPhone';
import { useAuth } from '../../auth/hooks/useAuth';
import { fetchSaleSms, retrySmsOutbox, SmsOutboxRow } from '../../sms/api/sms';
import { SmsStatusBadge } from '../../sms/components/SmsStatusBadge';
import { VoidModal } from '../components/VoidModal';
import { ReturnModal } from '../components/ReturnModal';
import { ReturnReceiptModal } from '../components/ReturnReceiptModal';
import {
  fetchReturnsForSale,
  ReturnDetailSnapshot,
  VoidSaleResult,
} from '../api/returns';
import { formatLKR } from '../../../lib/money';
import { formatReceiptPlainText } from '../../receipts/lib/formatPlainText';

export const SaleDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();
  const isManagerOrOwner = role === 'manager' || role === 'owner';

  const [bill, setBill] = useState<Bill | null>(null);
  const [smsRow, setSmsRow] = useState<SmsOutboxRow | null>(null);
  const [returnsList, setReturnsList] = useState<ReturnDetailSnapshot[]>([]);
  const [isRetryingSms, setIsRetryingSms] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printSuccess, setPrintSuccess] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [viewFormat, setViewFormat] = useState<'80mm' | '58mm' | 'a4'>('80mm');
  const [isPlainText, setIsPlainText] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<75 | 100 | 125>(100);

  // Modals state
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [activeReturnForModal, setActiveReturnForModal] =
    useState<ReturnDetailSnapshot | null>(null);

  const loadBill = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const [billData, smsData, returnsData] = await Promise.all([
        fetchBill(id),
        fetchSaleSms(id),
        fetchReturnsForSale(id),
      ]);
      setBill(billData);
      setSmsRow(smsData);
      setReturnsList(returnsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadBill();
  }, [loadBill]);

  const handlePrint = async () => {
    if (!bill) return;

    setIsPrinting(true);
    setPrintSuccess(false);

    try {
      if (viewFormat === 'a4') {
        window.print();
        await recordBillPrinted(bill.id);
        setPrintSuccess(true);
        loadBill();
      } else {
        const settings = getPrinterSettings();
        const res = await printBill(bill, {
          paperWidth: viewFormat,
          copies: settings.copies,
          openDrawer: settings.drawerOnCash,
        });

        if (!res.success) {
          throw new Error(res.error || 'Failed to print receipt.');
        }

        await recordBillPrinted(bill.id);
        setPrintSuccess(true);
        loadBill();
      }
    } catch (err) {
      alert('Print error: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsPrinting(false);
    }
  };

  const handleRetrySms = async () => {
    if (!smsRow) return;
    setIsRetryingSms(true);
    try {
      const res = await retrySmsOutbox(smsRow.id);
      if (!res.success) {
        alert(res.message || 'SMS retry failed at gateway');
      }
      const updatedSms = await fetchSaleSms(smsRow.sale_id || '');
      setSmsRow(updatedSms);
    } catch (err) {
      alert('Retry error: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsRetryingSms(false);
    }
  };

  const handleVoidSuccess = (result: VoidSaleResult) => {
    setVoidModalOpen(false);
    setActionSuccessMsg(
      `Sale #${bill?.bill_no} voided successfully. Stock restored across ${result.batches_restored} batches.`
    );
    loadBill();
  };

  const handleReturnSuccess = (returnSnapshot: ReturnDetailSnapshot) => {
    setReturnModalOpen(false);
    setActiveReturnForModal(returnSnapshot);
    setActionSuccessMsg(
      `Return ${returnSnapshot.return_number} processed. Total refund: ${formatLKR(
        returnSnapshot.total_refund_cents
      )}`
    );
    loadBill();
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-slate-500 font-mono text-sm">
        Loading immutable bill record #{id}...
      </div>
    );
  }

  if (error || !bill) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4">
        <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <AlertOctagon className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Sale Record Not Found</h2>
        <p className="text-xs text-slate-500">{error || 'Could not locate bill with specified ID.'}</p>
        <Button variant="outline" size="sm" onClick={() => window.history.back()}>
          Back to Sales Ledger
        </Button>
      </div>
    );
  }

  // Bill integrity verification
  const verification = verifyBill(bill);
  const hasIntegrityError = !verification.valid;
  const isVoidable = bill.status === 'completed' && returnsList.length === 0;
  const isReturnable = bill.status === 'completed' || bill.status === 'partially_returned';

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Bill #${bill.bill_no}`}
        subtitle="Completed retail sale transaction snapshot"
        backTo="/sales"
        backLabel="Back to Sales Ledger"
        badge={
          <Badge
            variant={
              bill.status === 'completed'
                ? 'success'
                : bill.status === 'voided'
                ? 'danger'
                : 'warning'
            }
            size="sm"
            dot
          >
            {bill.status}
          </Badge>
        }
        actions={
          <div className="flex items-center space-x-2">
            {isManagerOrOwner && isReturnable && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<RotateCcw className="w-4 h-4 text-purple-600" />}
                onClick={() => setReturnModalOpen(true)}
              >
                Return Items
              </Button>
            )}

            {isManagerOrOwner && isVoidable && (
              <Button
                variant="danger"
                size="sm"
                leftIcon={<Ban className="w-4 h-4" />}
                onClick={() => setVoidModalOpen(true)}
              >
                Void Sale
              </Button>
            )}

            <Button
              variant="primary"
              size="sm"
              disabled={hasIntegrityError}
              isLoading={isPrinting}
              leftIcon={<Printer className="w-4 h-4" />}
              onClick={handlePrint}
            >
              {bill.print_count >= 1 ? 'Reprint Bill (Duplicate)' : 'Print Receipt'}
            </Button>
          </div>
        }
      />

      {/* Cashier Informative Banner */}
      {!isManagerOrOwner && (isVoidable || isReturnable) && (
        <div className="p-3 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl flex items-center space-x-2 text-xs">
          <ShieldAlert className="w-4 h-4 text-slate-500 flex-shrink-0" />
          <span>
            Cashier note: Ask a manager or owner to void or process a return for this bill.
          </span>
        </div>
      )}

      {/* Success Notification Banner */}
      {actionSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center space-x-2 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* Bill Integrity Mismatch Banner */}
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
              Printing has been locked for this bill record. Incident logged to audit log.
            </p>
          </div>
        </div>
      )}

      {printSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center space-x-2 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>Receipt successfully dispatched to printer. Print count updated to {bill.print_count}.</span>
        </div>
      )}

      {/* Existing Returns / Credit Notes List */}
      {returnsList.length > 0 && (
        <div className="bg-purple-50/70 border border-purple-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <RotateCcw className="w-4 h-4 text-purple-700" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-purple-900">
                Issued Returns & Credit Notes ({returnsList.length})
              </h4>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {returnsList.map((ret) => (
              <div
                key={ret.return_id}
                className="bg-white p-3 rounded-lg border border-purple-200 shadow-2xs flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-slate-900">{ret.return_number}</div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    Refund: {formatLKR(ret.total_refund_cents)} ({ret.refund_method})
                  </div>
                  <div className="text-[10px] text-purple-800 italic">{ret.reason}</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  leftIcon={<FileText className="w-3.5 h-3.5 text-purple-600" />}
                  onClick={() => setActiveReturnForModal(ret)}
                >
                  View Credit Note
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Customer SMS Notification Status & Retry Panel */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start space-x-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0 mt-0.5">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                SMS Receipt Notification
              </span>
              <SmsStatusBadge
                status={smsRow ? smsRow.status : 'not_sent'}
                attempts={smsRow?.attempts}
              />
            </div>
            <div className="text-xs text-slate-700 font-medium mt-1">
              {smsRow ? (
                <span>Recipient: {maskPhoneNumber(smsRow.phone)}</span>
              ) : bill.customer?.phone ? (
                <span>Customer opted out or SMS disabled for phone {maskPhoneNumber(bill.customer.phone)}</span>
              ) : (
                <span>No customer phone number was linked to this transaction.</span>
              )}
            </div>
            {smsRow?.last_error && (
              <div className="text-[11px] text-rose-600 font-mono mt-0.5">
                Error: {smsRow.last_error}
              </div>
            )}
          </div>
        </div>

        {isManagerOrOwner && smsRow && (smsRow.status === 'failed' || smsRow.status === 'pending') && (
          <Button
            variant="outline"
            size="sm"
            isLoading={isRetryingSms}
            leftIcon={<RotateCcw className="w-4 h-4" />}
            onClick={handleRetrySms}
            className="self-start sm:self-center"
          >
            Retry SMS Gateway
          </Button>
        )}
      </div>

      {/* Format switch and preview controls toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-subtle">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mr-1">
            Format:
          </span>
          <button
            type="button"
            onClick={() => setViewFormat('80mm')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              viewFormat === '80mm'
                ? 'bg-brand-600 text-white shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            80mm Thermal
          </button>
          <button
            type="button"
            onClick={() => setViewFormat('58mm')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              viewFormat === '58mm'
                ? 'bg-brand-600 text-white shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            58mm Compact
          </button>
          <button
            type="button"
            onClick={() => setViewFormat('a4')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              viewFormat === 'a4'
                ? 'bg-brand-600 text-white shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            A4 Tax Invoice
          </button>

          {/* Plain Text vs Graphic Toggle (for thermal modes) */}
          {viewFormat !== 'a4' && (
            <button
              type="button"
              onClick={() => setIsPlainText(!isPlainText)}
              className={`ml-2 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
                isPlainText
                  ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 font-bold'
                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              {isPlainText ? 'Plain Text Mode' : 'Graphic Layout'}
            </button>
          )}
        </div>

        {/* Zoom and Print Count */}
        <div className="flex items-center space-x-3">
          {/* Zoom Level Switcher */}
          <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {([75, 100, 125] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setZoomLevel(lvl)}
                className={`px-2 py-0.5 text-[11px] font-mono font-bold rounded-lg transition-all ${
                  zoomLevel === lvl
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {lvl}%
              </button>
            ))}
          </div>

          <div className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
            Status: <span className="font-bold text-slate-900 dark:text-white">{bill.print_count >= 1 ? `Printed ${bill.print_count}x (Duplicate)` : 'Original (0x)'}</span>
          </div>
        </div>
      </div>

      {/* Document View Area: Realistic Paper Card on Dot-Grid Canvas */}
      <div className="preview-canvas-dotgrid p-8 rounded-3xl flex justify-center border border-slate-200 dark:border-slate-800 overflow-x-auto min-h-[500px]">
        <div
          className="transition-transform duration-200 origin-top"
          style={{ transform: `scale(${zoomLevel / 100})` }}
        >
          {viewFormat === 'a4' ? (
            <div className="w-full max-w-[210mm] bg-white rounded-xl shadow-overlay p-4">
              <A4Invoice bill={bill} />
            </div>
          ) : isPlainText ? (
            <div
              className="receipt-paper p-6 rounded-sm shadow-overlay"
              style={{ width: viewFormat === '58mm' ? '54mm' : '78mm' }}
            >
              <pre className="font-mono text-[11px] leading-tight whitespace-pre text-black">
                {formatReceiptPlainText(bill, viewFormat)}
              </pre>
            </div>
          ) : (
            <div className="receipt-paper rounded-sm shadow-overlay">
              <Receipt bill={bill} paperWidth={viewFormat} />
            </div>
          )}
        </div>
      </div>

      {/* Void Confirmation Modal */}
      <VoidModal
        isOpen={voidModalOpen}
        bill={bill}
        onClose={() => setVoidModalOpen(false)}
        onSuccess={handleVoidSuccess}
      />

      {/* Customer Return Modal */}
      <ReturnModal
        isOpen={returnModalOpen}
        bill={bill}
        onClose={() => setReturnModalOpen(false)}
        onSuccess={handleReturnSuccess}
      />

      {/* Return Credit Note Print Modal */}
      <ReturnReceiptModal
        isOpen={Boolean(activeReturnForModal)}
        returnSnapshot={activeReturnForModal}
        onClose={() => setActiveReturnForModal(null)}
      />
    </div>
  );
};

export default SaleDetailPage;
