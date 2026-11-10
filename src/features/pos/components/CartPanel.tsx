import React, { useState } from 'react';
import {
  Trash2,
  Plus,
  Minus,
  Tag,
  Phone,
  AlertTriangle,
  AlertCircle,
  CreditCard,
  Percent,
  X,
  User,
  ShoppingBag,
} from 'lucide-react';
import { useCartStore } from '../hooks/useCartStore';
import { ServerQuote } from '../types';
import { formatLKR } from '../../../lib/money';
import { Button } from '../../../components/ui/Button';
import { Money } from '../../../components/ui/Money';
import { useShopSettings } from '../../settings/hooks/useShopSettings';
import { useAuth } from '../../auth/hooks/useAuth';

export interface CartPanelProps {
  serverQuote: ServerQuote;
  isQuoteLoading: boolean;
  onOpenPayment: () => void;
  phoneInputRef: React.RefObject<HTMLInputElement>;
}

export const CartPanel: React.FC<CartPanelProps> = ({
  serverQuote,
  isQuoteLoading,
  onOpenPayment,
  phoneInputRef,
}) => {
  const {
    items,
    billDiscount,
    customerPhone,
    customerName,
    customerExists,
    customerOptedOut,
    customerPoints,
    sendSms,
    updateItemQty,
    updateItemDiscount,
    removeItem,
    setBillDiscount,
    setCustomer,
    setSendSms,
    clearCart,
  } = useCartStore();

  const { settings } = useShopSettings();
  const { role } = useAuth();

  const maxCashierDiscount = settings?.max_cashier_discount_percent ?? 5;
  const isCashier = role === 'cashier';

  // Discount editor modal/state for line items
  const [editingDiscountProductId, setEditingDiscountProductId] = useState<string | null>(null);
  const [lineDiscountType, setLineDiscountType] = useState<'none' | 'percent' | 'amount'>('none');
  const [lineDiscountValStr, setLineDiscountValStr] = useState('');
  const [lineDiscountError, setLineDiscountError] = useState<string | null>(null);

  // Bill-level discount editor state
  const [billDiscountOpen, setBillDiscountOpen] = useState(false);
  const [billDiscType, setBillDiscType] = useState<'none' | 'percent' | 'amount'>(billDiscount.type);
  const [billDiscValStr, setBillDiscValStr] = useState(billDiscount.value ? String(billDiscount.value) : '');
  const [billDiscError, setBillDiscError] = useState<string | null>(null);

  const openLineDiscountEditor = (productId: string) => {
    const item = items.find((i) => i.productId === productId);
    if (!item) return;

    setEditingDiscountProductId(productId);
    setLineDiscountType(item.discountType);
    setLineDiscountValStr(
      item.discountType === 'percent'
        ? String(item.discountValue)
        : item.discountType === 'amount'
        ? (item.discountValue / 100).toFixed(2)
        : ''
    );
    setLineDiscountError(null);
  };

  const handleApplyLineDiscount = (productId: string) => {
    if (lineDiscountType === 'none' || !lineDiscountValStr) {
      updateItemDiscount(productId, 'none', 0);
      setEditingDiscountProductId(null);
      return;
    }

    const val = parseFloat(lineDiscountValStr);
    if (isNaN(val) || val < 0) {
      setLineDiscountError('Enter a valid non-negative number');
      return;
    }

    if (lineDiscountType === 'percent') {
      if (isCashier && val > maxCashierDiscount) {
        setLineDiscountError(`Cashier max allowed discount is ${maxCashierDiscount}%`);
        return;
      }
      updateItemDiscount(productId, 'percent', val);
    } else {
      const cents = Math.round(val * 100);
      const item = items.find((i) => i.productId === productId);
      if (item && isCashier) {
        const gross = item.unitPriceCents * item.quantity;
        const maxCents = (gross * maxCashierDiscount) / 100;
        if (cents > maxCents) {
          setLineDiscountError(`Max allowed discount is ${maxCashierDiscount}% (${formatLKR(maxCents)})`);
          return;
        }
      }
      updateItemDiscount(productId, 'amount', cents);
    }

    setEditingDiscountProductId(null);
  };

  const handleApplyBillDiscount = () => {
    if (billDiscType === 'none' || !billDiscValStr) {
      setBillDiscount({ type: 'none', value: 0 });
      setBillDiscountOpen(false);
      return;
    }

    const val = parseFloat(billDiscValStr);
    if (isNaN(val) || val < 0) {
      setBillDiscError('Enter a valid non-negative number');
      return;
    }

    if (billDiscType === 'percent') {
      if (isCashier && val > maxCashierDiscount) {
        setBillDiscError(`Cashier max allowed discount is ${maxCashierDiscount}%`);
        return;
      }
      setBillDiscount({ type: 'percent', value: val });
    } else {
      const cents = Math.round(val * 100);
      if (isCashier) {
        const subtotal = serverQuote.subtotal_cents;
        const maxCents = (subtotal * maxCashierDiscount) / 100;
        if (cents > maxCents) {
          setBillDiscError(`Max allowed discount is ${maxCashierDiscount}% (${formatLKR(maxCents)})`);
          return;
        }
      }
      setBillDiscount({ type: 'amount', value: cents });
    }

    setBillDiscountOpen(false);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-subtle overflow-hidden">
      {/* Cart Header */}
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50">
        <div className="flex items-center space-x-2">
          <ShoppingBag className="w-4 h-4 text-brand-600 dark:text-brand-400" />
          <h2 className="font-bold text-sm text-slate-900 dark:text-slate-100">
            Active Cart ({items.length})
          </h2>
        </div>

        {items.length > 0 && (
          <button
            type="button"
            onClick={clearCart}
            className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 font-semibold flex items-center space-x-1 cursor-pointer transition-subtle"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Cart Items List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 p-2">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-slate-500">
            <ShoppingBag className="w-12 h-12 stroke-1 mb-2 text-slate-300 dark:text-slate-600" />
            <p className="font-semibold text-sm text-slate-600 dark:text-slate-400">Cart is empty</p>
            <p className="text-xs mt-1 text-slate-400 dark:text-slate-500">Scan barcodes or tap products to begin a sale.</p>
          </div>
        ) : (
          items.map((item, index) => {
            const isEditingDiscount = editingDiscountProductId === item.productId;
            const exceedsStock = item.quantity > item.maxStockQty;
            const isJustAdded = index === 0;

            return (
              <div
                key={item.productId}
                className={`p-2.5 rounded-xl transition-subtle ${
                  isJustAdded ? 'animate-highlight' : ''
                } ${
                  exceedsStock
                    ? 'bg-rose-50/60 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-start justify-between space-x-2">
                  {/* Name and unit price */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      <Money size="sm" cents={item.unitPriceCents} /> /{item.unit}
                    </div>

                    {/* Stock Alert */}
                    {exceedsStock ? (
                      <div className="text-[10px] font-bold text-rose-600 dark:text-rose-400 mt-0.5 flex items-center space-x-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Only {item.maxStockQty} left in stock!</span>
                      </div>
                    ) : item.maxStockQty <= 5 ? (
                      <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 mt-0.5">
                        Only {item.maxStockQty} left
                      </div>
                    ) : null}

                    {/* Price Changed Notice */}
                    {item.priceChanged && (
                      <div className="text-[10px] font-bold text-amber-800 dark:text-amber-400 mt-0.5">
                        Price updated by server
                      </div>
                    )}
                  </div>

                  {/* Quantity Stepper & Direct Input */}
                  <div className="flex items-center space-x-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        updateItemQty(
                          item.productId,
                          item.allowDecimalQty ? Math.max(0, item.quantity - 0.5) : item.quantity - 1
                        )
                      }
                      className="w-7 h-7 flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg transition-subtle cursor-pointer active:scale-95"
                    >
                      <Minus className="w-3 h-3" />
                    </button>

                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.quantity}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) updateItemQty(item.productId, val);
                      }}
                      className="w-14 text-center font-mono font-bold text-xs py-1 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 tabular-nums"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        updateItemQty(
                          item.productId,
                          item.allowDecimalQty ? item.quantity + 0.5 : item.quantity + 1
                        )
                      }
                      className="w-7 h-7 flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg transition-subtle cursor-pointer active:scale-95"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Line Total & Remove */}
                  <div className="text-right flex-shrink-0 w-20">
                    <Money size="sm" cents={item.localLineTotalCents} />
                    <button
                      type="button"
                      onClick={() => removeItem(item.productId)}
                      className="block text-[10px] text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 mt-0.5 transition-subtle cursor-pointer ml-auto"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {/* Line Discount Pill & Toggle */}
                <div className="mt-1.5 flex items-center space-x-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => openLineDiscountEditor(item.productId)}
                    className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold transition-subtle cursor-pointer ${
                      item.discountType !== 'none' && item.discountValue > 0
                        ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                        : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    <Tag className="w-3 h-3" />
                    <span>
                      {item.discountType === 'percent'
                        ? `${item.discountValue}% off`
                        : item.discountType === 'amount'
                        ? `Rs. ${(item.discountValue / 100).toFixed(2)} off`
                        : 'Add discount'}
                    </span>
                  </button>
                </div>

                {/* Inline Line Discount Editor */}
                {isEditingDiscount && (
                  <div className="mt-2 p-2 bg-slate-100 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700 text-xs space-y-2">
                    <div className="flex items-center space-x-2">
                      <select
                        value={lineDiscountType}
                        onChange={(e) => setLineDiscountType(e.target.value as 'none' | 'percent' | 'amount')}
                        className="py-1 px-1.5 border border-slate-300 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      >
                        <option value="none">No Discount</option>
                        <option value="percent">% Percent</option>
                        <option value="amount">Rs. Amount</option>
                      </select>

                      {lineDiscountType !== 'none' && (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={lineDiscountValStr}
                          onChange={(e) => setLineDiscountValStr(e.target.value)}
                          placeholder={lineDiscountType === 'percent' ? '5%' : '50.00'}
                          className="w-20 py-1 px-1.5 border border-slate-300 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono"
                        />
                      )}

                      <Button
                        size="sm"
                        variant="primary"
                        type="button"
                        onClick={() => handleApplyLineDiscount(item.productId)}
                        className="py-1 px-2 text-xs"
                      >
                        Save
                      </Button>
                      <button
                        type="button"
                        onClick={() => setEditingDiscountProductId(null)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {lineDiscountError && (
                      <p className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">{lineDiscountError}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Customer & Bill Settings Section */}
      <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
        {/* Customer Phone Search */}
        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
              <Phone className="w-3.5 h-3.5" />
            </span>
            <input
              ref={phoneInputRef}
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomer(e.target.value, customerName, customerExists)}
              placeholder="Customer Phone (F6)..."
              className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {customerPhone.trim().length >= 9 && (
            <div className="flex items-center space-x-1.5 text-xs text-brand-800 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800/80 px-2 py-1 rounded-lg">
              <User className="w-3 h-3 text-brand-600 dark:text-brand-400" />
              <span className="font-semibold truncate max-w-[130px]">
                {customerExists && customerName
                  ? `${customerName}${customerPoints !== null ? ` (${customerPoints} pts)` : ''}`
                  : 'New customer'}
              </span>
            </div>
          )}
        </div>

        {/* Loyalty Points Preview */}
        {settings?.loyalty_enabled && (
          <div className="space-y-1">
            {customerPhone.trim().length >= 9 && customerExists && (
              <div className="px-2.5 py-1 bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800/80 rounded-lg flex items-center justify-between text-[11px] text-brand-900 dark:text-brand-300">
                <span className="font-medium">Loyalty points balance:</span>
                <span className="font-bold">{customerPoints ?? 0} pts</span>
              </div>
            )}
            {serverQuote.total_cents > 0 && (
              <div className="text-[10px] text-brand-700 dark:text-brand-400 flex justify-between px-1">
                <span>Points to earn on bill:</span>
                <span className="font-semibold font-mono">
                  +{Math.floor((serverQuote.total_cents / 10000) * (Number(settings?.loyalty_points_per_100_lkr) || 1))} pts
                </span>
              </div>
            )}
          </div>
        )}

        {/* SMS Toggle & Customer Consent Reminder */}
        {settings?.sms_enabled && customerPhone.trim().length >= 9 && (
          customerOptedOut ? (
            <div className="p-2 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/80 rounded-lg text-[11px] text-amber-800 dark:text-amber-300 flex items-center space-x-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <span>Customer has opted out of SMS notifications</span>
            </div>
          ) : (
            <div className="p-2 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg space-y-1">
              <label className="flex items-start space-x-2 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sendSms}
                  onChange={(e) => setSendSms(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <div>
                  <span className="font-semibold text-slate-900 dark:text-slate-100 block">Customer agrees to receive SMS</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Ask customer for verbal consent to send receipt via SMS</span>
                </div>
              </label>
            </div>
          )
        )}

        {/* Bill-Level Discount Trigger */}
        <div className="flex items-center justify-between text-xs pt-1">
          <button
            type="button"
            onClick={() => {
              setBillDiscountOpen(!billDiscountOpen);
              setBillDiscError(null);
            }}
            className="text-brand-700 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 font-semibold flex items-center space-x-1 cursor-pointer"
          >
            <Percent className="w-3.5 h-3.5" />
            <span>
              {billDiscount.type !== 'none' && billDiscount.value > 0
                ? `Bill Discount: ${
                    billDiscount.type === 'percent'
                      ? `${billDiscount.value}%`
                      : formatLKR(billDiscount.value)
                  }`
                : 'Add Bill Discount'}
            </span>
          </button>
        </div>

        {/* Inline Bill Discount Form */}
        {billDiscountOpen && (
          <div className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2 text-xs">
            <div className="flex items-center space-x-2">
              <select
                value={billDiscType}
                onChange={(e) => setBillDiscType(e.target.value as 'none' | 'percent' | 'amount')}
                className="py-1 px-1.5 border border-slate-300 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="none">No Discount</option>
                <option value="percent">% Percent</option>
                <option value="amount">Rs. Amount</option>
              </select>

              {billDiscType !== 'none' && (
                <input
                  type="text"
                  inputMode="decimal"
                  value={billDiscValStr}
                  onChange={(e) => setBillDiscValStr(e.target.value)}
                  placeholder={billDiscType === 'percent' ? '5%' : '100.00'}
                  className="w-24 py-1 px-1.5 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              )}

              <Button
                size="sm"
                variant="primary"
                type="button"
                onClick={handleApplyBillDiscount}
                className="py-1 px-2.5 text-xs"
              >
                Apply
              </Button>
            </div>
            {billDiscError && (
              <p className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">{billDiscError}</p>
            )}
          </div>
        )}
      </div>

      {/* Sticky Authoritative Server Quote Totals Summary */}
      <div className="p-4 bg-slate-900 text-white space-y-2 border-t border-slate-800">
        <div className="space-y-1 text-xs">
          <div className="flex justify-between text-slate-400">
            <span>Subtotal</span>
            <Money size="sm" cents={serverQuote.subtotal_cents} className="text-slate-200" />
          </div>

          {serverQuote.line_discount_cents > 0 && (
            <div className="flex justify-between text-amber-400">
              <span>Line Discounts</span>
              <span className="font-mono tabular-nums">
                -<Money size="sm" cents={serverQuote.line_discount_cents} className="text-amber-400" />
              </span>
            </div>
          )}

          {serverQuote.bill_discount_cents > 0 && (
            <div className="flex justify-between text-amber-400">
              <span>Bill Discount</span>
              <span className="font-mono tabular-nums">
                -<Money size="sm" cents={serverQuote.bill_discount_cents} className="text-amber-400" />
              </span>
            </div>
          )}

          {serverQuote.tax.rate_percent > 0 && (
            <div className="flex justify-between text-slate-400">
              <span>
                VAT ({serverQuote.tax.rate_percent}% {serverQuote.tax.mode})
              </span>
              <Money size="sm" cents={serverQuote.tax.tax_cents} className="text-slate-200" />
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-slate-800 flex items-baseline justify-between">
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
              Grand Total
            </span>
            {isQuoteLoading && (
              <span className="text-[10px] text-amber-400 block animate-pulse">
                Quoting server...
              </span>
            )}
          </div>
          <Money size="hero" cents={serverQuote.total_cents} className="text-emerald-400" />
        </div>

        {/* Block Pay banner if any cart line exceeds live stock */}
        {items.some((i) => i.quantity > i.maxStockQty) && (
          <div className="p-2.5 bg-amber-950/90 border border-amber-500 rounded-xl text-amber-200 text-xs font-semibold flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>Some items exceed live stock. Adjust quantities to continue.</span>
          </div>
        )}

        {/* Large Pay Button (F4) */}
        <Button
          variant="primary"
          size="lg"
          disabled={
            items.length === 0 ||
            isQuoteLoading ||
            serverQuote.total_cents <= 0 ||
            items.some((i) => i.quantity > i.maxStockQty)
          }
          onClick={onOpenPayment}
          leftIcon={<CreditCard className="w-5 h-5" />}
          className="w-full mt-2 font-black text-base py-3.5 shadow-raised flex justify-center items-center"
        >
          {isQuoteLoading
            ? 'Calculating Total...'
            : items.some((i) => i.quantity > i.maxStockQty)
            ? 'Stock Exceeded (Fix Items)'
            : `Pay (F4)`}
        </Button>
      </div>
    </div>
  );
};
