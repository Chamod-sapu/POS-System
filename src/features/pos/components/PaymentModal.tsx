import React, { useState, useEffect, useRef } from 'react';
import {
  Banknote,
  CreditCard,
  Building2,
  Split,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { PaymentMethod, PaymentEntry, ServerQuote, SaleCheckoutResult } from '../types';
import { formatLKR, toCents } from '../../../lib/money';
import { Money } from '../../../components/ui/Money';
import { Keypad } from '../../../components/ui/Keypad';
import { useCartStore } from '../hooks/useCartStore';
import { createSale } from '../api/pos';
import { mapErrorMessage } from '../../../lib/errors';
import { useToast } from '../../../components/ui/Toast';

export interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverQuote: ServerQuote;
  onSaleSuccess: (sale: SaleCheckoutResult) => void;
  onStockErrorRefresh: () => void;
}

type TabMode = 'cash' | 'card' | 'bank_transfer' | 'split';

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  serverQuote,
  onSaleSuccess,
  onStockErrorRefresh,
}) => {
  const toast = useToast();
  const {
    items,
    billDiscount,
    customerPhone,
    customerName,
    customerOptedOut,
    sendSms,
    getIdempotencyKey,
    resetIdempotencyKey,
  } = useCartStore();

  const [activeTab, setActiveTab] = useState<TabMode>('cash');

  // Single Method States
  const [cashTenderedRupees, setCashTenderedRupees] = useState('');
  const [cardReference, setCardReference] = useState('');
  const [bankReference, setBankReference] = useState('');

  // Split Payments State
  const [splitPayments, setSplitPayments] = useState<PaymentEntry[]>([]);
  const [splitMethod, setSplitMethod] = useState<PaymentMethod>('cash');
  const [splitAmountRupees, setSplitAmountRupees] = useState('');
  const [splitReference, setSplitReference] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const cashInputRef = useRef<HTMLInputElement>(null);

  const totalCents = serverQuote.total_cents;

  // Initialize or focus whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setCheckoutError(null);
      setIsSubmitting(false);

      // Default Cash Tendered to Exact Total
      const defaultCash = (totalCents / 100).toFixed(2);
      setCashTenderedRupees(defaultCash);
      setCardReference('');
      setBankReference('');
      setSplitPayments([]);
      setActiveTab('cash');

      setTimeout(() => {
        cashInputRef.current?.focus();
        cashInputRef.current?.select();
      }, 50);
    }
  }, [isOpen, totalCents]);

  // Compute payments array based on active tab
  let currentPayments: PaymentEntry[] = [];
  let totalPaidCents = 0;
  let changeCents = 0;

  if (activeTab === 'cash') {
    let tenderedCents = 0;
    try {
      tenderedCents = cashTenderedRupees ? Number(toCents(cashTenderedRupees)) : 0;
    } catch {
      tenderedCents = 0;
    }
    currentPayments = [{ method: 'cash', amountCents: tenderedCents }];
    totalPaidCents = tenderedCents;
    changeCents = Math.max(0, totalPaidCents - totalCents);
  } else if (activeTab === 'card') {
    currentPayments = [{ method: 'card', amountCents: totalCents, reference: cardReference }];
    totalPaidCents = totalCents;
    changeCents = 0;
  } else if (activeTab === 'bank_transfer') {
    currentPayments = [{ method: 'bank_transfer', amountCents: totalCents, reference: bankReference }];
    totalPaidCents = totalCents;
    changeCents = 0;
  } else if (activeTab === 'split') {
    currentPayments = splitPayments;
    totalPaidCents = splitPayments.reduce((acc, p) => acc + p.amountCents, 0);
    const cashInSplit = splitPayments
      .filter((p) => p.method === 'cash')
      .reduce((acc, p) => acc + p.amountCents, 0);
    const nonCashInSplit = totalPaidCents - cashInSplit;
    if (totalPaidCents >= totalCents) {
      changeCents = Math.max(0, cashInSplit - (totalCents - nonCashInSplit));
    } else {
      changeCents = 0;
    }
  }

  const isCovered = totalPaidCents >= totalCents;
  const remainingDueCents = Math.max(0, totalCents - totalPaidCents);

  // Keypad handlers for cash input
  const handleKeypadPress = (digit: string) => {
    setCashTenderedRupees((prev) => {
      if (digit === '.') {
        if (prev.includes('.')) return prev;
        return (prev || '0') + '.';
      }
      if (digit === '00') {
        if (!prev || prev === '0') return '0';
        return prev + '00';
      }
      if (prev === '0') return digit;
      return prev + digit;
    });
  };

  const handleKeypadBackspace = () => {
    setCashTenderedRupees((prev) => (prev.length > 1 ? prev.slice(0, -1) : ''));
  };

  const handleKeypadClear = () => {
    setCashTenderedRupees('');
  };

  // Quick preset cash handlers
  const handlePresetCash = (amountRupees: number) => {
    setCashTenderedRupees(amountRupees.toFixed(2));
    setTimeout(() => cashInputRef.current?.focus(), 20);
  };

  const handleAddSplitLine = () => {
    if (!splitAmountRupees) return;
    try {
      const cents = Number(toCents(splitAmountRupees));
      if (cents <= 0) return;

      if (splitMethod !== 'cash' && cents > remainingDueCents) {
        toast.error('Electronic payment cannot exceed remaining balance.');
        return;
      }

      setSplitPayments((prev) => [
        ...prev,
        {
          method: splitMethod,
          amountCents: cents,
          reference: splitReference.trim() || undefined,
        },
      ]);

      setSplitAmountRupees('');
      setSplitReference('');
    } catch {
      toast.error('Invalid amount entered.');
    }
  };

  const handleConfirmCheckout = async () => {
    if (!isCovered || isSubmitting) return;

    setIsSubmitting(true);
    setCheckoutError(null);

    const idempotencyKey = getIdempotencyKey();

    try {
      const saleResult = await createSale({
        idempotencyKey,
        customerPhone: customerPhone.trim() || undefined,
        customerName: customerName?.trim() || undefined,
        items,
        billDiscount,
        payments: currentPayments,
      });

      resetIdempotencyKey();
      onSaleSuccess(saleResult);
    } catch (err) {
      const msg = mapErrorMessage(err);
      setCheckoutError(msg);

      if (msg.toLowerCase().includes('stock') || msg.toLowerCase().includes('out of stock')) {
        toast.error('Live inventory changed! Refreshing catalog...');
        onStockErrorRefresh();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title="Complete Sale Payment"
      description="Select payment method and reconcile tendered cash."
    >
      <div className="space-y-5">
        {/* Authoritative Bill Summary Header */}
        <div className="p-4 bg-slate-900 text-white rounded-2xl flex items-center justify-between shadow-subtle border border-slate-800">
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold text-slate-400">Total Due</div>
            <Money size="hero" cents={totalCents} className="text-white mt-0.5" />
            {serverQuote.tax.rate_percent > 0 && (
              <div className="text-[11px] text-slate-400 mt-1">
                Includes {serverQuote.tax.rate_percent}% {serverQuote.tax.mode} VAT ({formatLKR(serverQuote.tax.tax_cents)})
              </div>
            )}
          </div>

          <div className="text-right">
            <div className="text-xs uppercase tracking-wider font-semibold text-slate-400">Change Due</div>
            <div className="mt-0.5">
              <Money
                size="hero"
                cents={changeCents}
                className={changeCents > 0 ? 'text-emerald-400' : 'text-slate-500'}
              />
            </div>
          </div>
        </div>

        {/* Big Payment Method Selector Buttons */}
        <div className="grid grid-cols-4 gap-2.5">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              setActiveTab('cash');
              setCashTenderedRupees((totalCents / 100).toFixed(2));
              setTimeout(() => cashInputRef.current?.focus(), 50);
            }}
            className={`py-3 px-3 rounded-xl border flex flex-col items-center justify-center space-y-1.5 transition-subtle cursor-pointer ${
              activeTab === 'cash'
                ? 'bg-brand-50 dark:bg-brand-950/80 border-brand-600 dark:border-brand-500 text-brand-900 dark:text-brand-300 shadow-subtle font-bold'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <Banknote className="w-6 h-6" />
            <span className="text-xs font-bold">Cash</span>
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setActiveTab('card')}
            className={`py-3 px-3 rounded-xl border flex flex-col items-center justify-center space-y-1.5 transition-subtle cursor-pointer ${
              activeTab === 'card'
                ? 'bg-brand-50 dark:bg-brand-950/80 border-brand-600 dark:border-brand-500 text-brand-900 dark:text-brand-300 shadow-subtle font-bold'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <CreditCard className="w-6 h-6" />
            <span className="text-xs font-bold">Card</span>
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setActiveTab('bank_transfer')}
            className={`py-3 px-3 rounded-xl border flex flex-col items-center justify-center space-y-1.5 transition-subtle cursor-pointer ${
              activeTab === 'bank_transfer'
                ? 'bg-brand-50 dark:bg-brand-950/80 border-brand-600 dark:border-brand-500 text-brand-900 dark:text-brand-300 shadow-subtle font-bold'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <Building2 className="w-6 h-6" />
            <span className="text-xs font-bold">Bank Transfer</span>
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setActiveTab('split')}
            className={`py-3 px-3 rounded-xl border flex flex-col items-center justify-center space-y-1.5 transition-subtle cursor-pointer ${
              activeTab === 'split'
                ? 'bg-brand-50 dark:bg-brand-950/80 border-brand-600 dark:border-brand-500 text-brand-900 dark:text-brand-300 shadow-subtle font-bold'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <Split className="w-6 h-6" />
            <span className="text-xs font-bold">Split</span>
          </button>
        </div>

        {/* Tab 1: CASH PAYMENT WITH KEYPAD */}
        {activeTab === 'cash' && (
          <div className="space-y-4 bg-slate-50 dark:bg-slate-800/50 p-4 border border-slate-200 dark:border-slate-800 rounded-2xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              {/* Left: Input & Quick Presets */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Cash Tendered (Rs.)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400">Rs.</span>
                    <input
                      ref={cashInputRef}
                      type="text"
                      inputMode="decimal"
                      disabled={isSubmitting}
                      value={cashTenderedRupees}
                      onChange={(e) => setCashTenderedRupees(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && isCovered && !isSubmitting) {
                          e.preventDefault();
                          handleConfirmCheckout();
                        }
                      }}
                      className="w-full text-2xl font-mono font-bold pl-12 pr-4 py-2.5 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 tabular-nums shadow-subtle"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Quick Currency Presets */}
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Quick Cash Presets (LKR)
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handlePresetCash(totalCents / 100)}
                      className="py-2 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-brand-50 dark:hover:bg-brand-950/60 text-brand-800 dark:text-brand-300 rounded-lg shadow-subtle transition-subtle cursor-pointer"
                    >
                      Exact
                    </button>
                    {[500, 1000, 2000, 5000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handlePresetCash(amt)}
                        className="py-2 text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg shadow-subtle transition-subtle cursor-pointer"
                      >
                        Rs. {amt.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Numeric Keypad for fast touchscreen input */}
              <div className="border border-slate-200 dark:border-slate-700/80 rounded-xl p-2 bg-white dark:bg-slate-900 shadow-subtle">
                <div className="text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500 mb-1 px-1">
                  Touch Keypad
                </div>
                <Keypad
                  onKeyPress={handleKeypadPress}
                  onBackspace={handleKeypadBackspace}
                  onClear={handleKeypadClear}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: CARD PAYMENT */}
        {activeTab === 'card' && (
          <div className="space-y-4 bg-slate-50 dark:bg-slate-800/50 p-4 border border-slate-200 dark:border-slate-800 rounded-2xl">
            <div className="flex items-center justify-between p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-subtle">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Card Charge:</span>
              <Money size="md" cents={totalCents} className="text-slate-900 dark:text-slate-100" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Card Reference / Auth Code (Optional)
              </label>
              <input
                type="text"
                disabled={isSubmitting}
                value={cardReference}
                onChange={(e) => setCardReference(e.target.value)}
                placeholder="e.g. Approval code from POS terminal"
                className="w-full text-sm font-mono py-2.5 px-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-subtle"
              />
            </div>
          </div>
        )}

        {/* Tab 3: BANK TRANSFER */}
        {activeTab === 'bank_transfer' && (
          <div className="space-y-4 bg-slate-50 dark:bg-slate-800/50 p-4 border border-slate-200 dark:border-slate-800 rounded-2xl">
            <div className="flex items-center justify-between p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-subtle">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Transfer Amount:</span>
              <Money size="md" cents={totalCents} className="text-slate-900 dark:text-slate-100" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Bank Reference / Slip No (Optional)
              </label>
              <input
                type="text"
                disabled={isSubmitting}
                value={bankReference}
                onChange={(e) => setBankReference(e.target.value)}
                placeholder="e.g. BOC / Commercial Bank transfer reference"
                className="w-full text-sm font-mono py-2.5 px-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-subtle"
              />
            </div>
          </div>
        )}

        {/* Tab 4: SPLIT PAYMENT */}
        {activeTab === 'split' && (
          <div className="space-y-4 bg-slate-50 dark:bg-slate-800/50 p-4 border border-slate-200 dark:border-slate-800 rounded-2xl">
            <div className="flex items-center justify-between text-xs font-bold pb-2 border-b border-slate-200 dark:border-slate-800">
              <span className="text-slate-600 dark:text-slate-400">Remaining Due to Cover:</span>
              <Money
                size="sm"
                cents={remainingDueCents}
                className={remainingDueCents > 0 ? 'text-rose-600 dark:text-rose-400 font-extrabold' : 'text-emerald-700 dark:text-emerald-400'}
              />
            </div>

            {/* Split Lines List */}
            {splitPayments.length > 0 && (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden text-xs shadow-subtle">
                {splitPayments.map((p, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="uppercase font-bold text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-700 dark:text-slate-300">
                        {p.method}
                      </span>
                      {p.reference && <span className="font-mono text-slate-400">Ref: {p.reference}</span>}
                    </div>
                    <div className="flex items-center space-x-3">
                      <Money size="sm" cents={p.amountCents} className="text-slate-900 dark:text-slate-100 font-bold" />
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => setSplitPayments(splitPayments.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-subtle cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Split Line Input Form */}
            {remainingDueCents > 0 && (
              <div className="grid grid-cols-12 gap-2 items-end pt-1">
                <div className="col-span-3">
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Method</label>
                  <select
                    disabled={isSubmitting}
                    value={splitMethod}
                    onChange={(e) => setSplitMethod(e.target.value as PaymentMethod)}
                    className="w-full text-xs font-semibold py-2 px-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-subtle"
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank</option>
                  </select>
                </div>

                <div className="col-span-4">
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Amount (Rs.)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={isSubmitting}
                    value={splitAmountRupees}
                    onChange={(e) => setSplitAmountRupees(e.target.value)}
                    placeholder={(remainingDueCents / 100).toFixed(2)}
                    className="w-full text-xs font-mono font-bold py-2 px-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-subtle"
                  />
                </div>

                <div className="col-span-3">
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Ref (Opt)</label>
                  <input
                    type="text"
                    disabled={isSubmitting}
                    value={splitReference}
                    onChange={(e) => setSplitReference(e.target.value)}
                    placeholder="Ref #"
                    className="w-full text-xs py-2 px-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-subtle"
                  />
                </div>

                <div className="col-span-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    disabled={isSubmitting || !splitAmountRupees}
                    onClick={handleAddSplitLine}
                    className="w-full h-9 flex justify-center items-center"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error Banner */}
        {checkoutError && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/80 text-rose-800 dark:text-rose-200 rounded-xl text-xs flex items-center space-x-2 shadow-subtle">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{checkoutError}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
          >
            Cancel (Esc)
          </Button>

          <Button
            variant="primary"
            size="lg"
            type="button"
            disabled={!isCovered || isSubmitting}
            isLoading={isSubmitting}
            onClick={handleConfirmCheckout}
            leftIcon={<CheckCircle2 className="w-5 h-5" />}
            className="px-8 font-bold text-base shadow-raised"
          >
            Confirm & Print Bill (Enter)
          </Button>
        </div>
      </div>
    </Modal>
  );
};
