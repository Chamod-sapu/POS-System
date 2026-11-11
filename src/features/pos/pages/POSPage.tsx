import React, { useState, useEffect, useRef, useTransition } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Barcode,
  Volume2,
  VolumeX,
  Keyboard,
  PauseCircle,
  PlayCircle,
  AlertCircle,
  ShoppingBag,
  ChevronUp,
  Monitor,
} from 'lucide-react';
import { fetchPOSProducts, searchPOSProducts, lookupCustomerByPhone, quoteSale, holdCurrentCart } from '../api/pos';
import { POSProduct, ServerQuote, SaleCheckoutResult, HeldCartRow } from '../types';
import { useCartStore } from '../hooks/useCartStore';
import { soundEffects } from '../../../lib/audio';
import { ProductGrid } from '../components/ProductGrid';
import { CartPanel } from '../components/CartPanel';
import { QuantityModal } from '../components/QuantityModal';
import { PaymentModal } from '../components/PaymentModal';
import { HeldCartsModal } from '../components/HeldCartsModal';
import { HoldCartDialog } from '../components/HoldCartDialog';
import { KeyboardShortcutsModal } from '../components/KeyboardShortcutsModal';
import { SaleSuccessModal } from '../components/SaleSuccessModal';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { formatLKR } from '../../../lib/money';
import { Money } from '../../../components/ui/Money';
import { useCurrentShift } from '../../shifts/hooks/useCurrentShift';
import { ShiftGate } from '../../shifts/components/ShiftGate';

export const POSPage: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [, startTransition] = useTransition();

  // Cart store
  const {
    items,
    billDiscount,
    customerPhone,
    addItem,
    clearCart,
    restoreCart,
    revalidateWithFreshCatalog,
    setCustomer,
  } = useCartStore();

  // Audio mute state
  const [isMuted, setIsMuted] = useState(() => soundEffects.getMuted());

  // Search and Barcode Input State
  const [scanQuery, setScanQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scanNotFoundMsg, setScanNotFoundMsg] = useState<string | null>(null);

  // Modals state
  const [weighedProduct, setWeighedProduct] = useState<POSProduct | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [holdCartDialogOpen, setHoldCartDialogOpen] = useState(false);
  const [heldCartsModalOpen, setHeldCartsModalOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState<SaleCheckoutResult | null>(null);

  // Mobile / Tablet Slide-up Cart Drawer State
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // Input refs for keyboard focus navigation
  const scanInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  // 1. Fetch live catalog strictly from pos_products view (cashiers have no access to products table)
  const { data: catalog = [], isLoading: isCatalogLoading, refetch: refetchCatalog } = useQuery({
    queryKey: ['pos-products'],
    queryFn: fetchPOSProducts,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

  // Revalidate cart against fresh catalog on mount
  useEffect(() => {
    if (catalog.length > 0) {
      revalidateWithFreshCatalog(catalog);
    }
  }, [catalog, revalidateWithFreshCatalog]);

  // 2. Debounce scan/search query by 150ms for live dropdown
  useEffect(() => {
    const handler = setTimeout(() => {
      startTransition(() => {
        setDebouncedSearch(scanQuery.trim());
        setSelectedIndex(0);
      });
    }, 150);
    return () => clearTimeout(handler);
  }, [scanQuery]);

  // 3. Search query from pos_products view
  const { data: searchResults = [], isFetching: isSearching } = useQuery({
    queryKey: ['pos-search', debouncedSearch],
    queryFn: () => searchPOSProducts(debouncedSearch),
    enabled: debouncedSearch.length > 0,
  });

  // 4. Live customer phone lookup (debounced 300ms)
  useEffect(() => {
    if (customerPhone.trim().length < 9) return;
    const handler = setTimeout(async () => {
      try {
        const res = await lookupCustomerByPhone(customerPhone);
        if (res.exists && res.name) {
          setCustomer(customerPhone, res.name, true, res.smsOptOut ?? false, res.pointsBalance ?? 0);
        } else {
          setCustomer(customerPhone, '', false, false, null);
        }
      } catch {
        // Ignore customer lookup failure
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [customerPhone, setCustomer]);

  // 5. Authoritative Preview Calculation via quote_sale (debounced 200ms)
  const [serverQuote, setServerQuote] = useState<ServerQuote>({
    lines: [],
    subtotal_cents: 0,
    line_discount_cents: 0,
    bill_discount_cents: 0,
    tax: { rate_percent: 0, mode: 'exclusive', taxable_cents: 0, tax_cents: 0 },
    total_cents: 0,
    warnings: [],
  });
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);

  useEffect(() => {
    if (items.length === 0) {
      setServerQuote({
        lines: [],
        subtotal_cents: 0,
        line_discount_cents: 0,
        bill_discount_cents: 0,
        tax: { rate_percent: 0, mode: 'exclusive', taxable_cents: 0, tax_cents: 0 },
        total_cents: 0,
        warnings: [],
      });
      return;
    }

    setIsQuoteLoading(true);
    const handler = setTimeout(async () => {
      try {
        const quote = await quoteSale(items, billDiscount);
        setServerQuote(quote);
      } catch (err: unknown) {
        // Out of stock warning from server
        console.warn('Quote error:', err instanceof Error ? err.message : String(err));
      } finally {
        setIsQuoteLoading(false);
      }
    }, 200);

    return () => clearTimeout(handler);
  }, [items, billDiscount]);

  // Refocus scan input whenever active modals close
  const focusScanInput = () => {
    setTimeout(() => {
      scanInputRef.current?.focus();
    }, 50);
  };

  // Add a product to cart (or trigger decimal quantity pop-up if weighable)
  const handleAddProduct = (product: POSProduct, forcedQty?: number) => {
    setScanNotFoundMsg(null);

    // If product is weighable / allows decimal, prompt cashier with quantity modal
    if (product.allow_decimal_qty && forcedQty === undefined) {
      setWeighedProduct(product);
      return;
    }

    const qty = forcedQty ?? 1;
    const res = addItem(product, qty);
    if (res.success) {
      soundEffects.playSuccessBeep();
      setScanQuery('');
      focusScanInput();
    } else {
      soundEffects.playErrorBeep();
      toast.error(res.error || 'Failed to add item');
    }
  };

  // 6. Fast Barcode Scanner & Enter Key handler
  const handleScanInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (searchResults.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % searchResults.length);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (searchResults.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length);
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const raw = scanQuery.trim();
      if (!raw) return;

      // 1. Exact match by barcode or SKU in local catalog
      const exactMatch = catalog.find(
        (p) =>
          p.barcode?.toLowerCase() === raw.toLowerCase() ||
          p.sku.toLowerCase() === raw.toLowerCase()
      );

      if (exactMatch) {
        if (Number(exactMatch.stock_qty) <= 0) {
          soundEffects.playErrorBeep();
          setScanNotFoundMsg(`"${exactMatch.name}" is out of stock.`);
          return;
        }
        handleAddProduct(exactMatch);
        return;
      }

      // 2. If dropdown has search results, select the currently highlighted one
      if (searchResults.length > 0) {
        const selected = searchResults[selectedIndex] || searchResults[0];
        if (selected) {
          if (Number(selected.stock_qty) <= 0) {
            soundEffects.playErrorBeep();
            setScanNotFoundMsg(`"${selected.name}" is out of stock.`);
            return;
          }
          handleAddProduct(selected);
          return;
        }
      }

      // 3. Not found
      soundEffects.playErrorBeep();
      setScanNotFoundMsg(`Item not found for barcode/SKU: "${raw}"`);
    }
  };

  // 7. Global Keyboard Shortcuts Listener
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't intercept shortcuts when typing in a modal or text area
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

      // F2: Focus Barcode / Search Input
      if (e.key === 'F2') {
        e.preventDefault();
        scanInputRef.current?.focus();
        scanInputRef.current?.select();
        return;
      }

      // F4: Open Payment Modal
      if (e.key === 'F4') {
        e.preventDefault();
        if (items.length > 0 && !isQuoteLoading && serverQuote.total_cents > 0) {
          setPaymentModalOpen(true);
        }
        return;
      }

      // F6: Focus Customer Phone Lookup
      if (e.key === 'F6') {
        e.preventDefault();
        phoneInputRef.current?.focus();
        phoneInputRef.current?.select();
        return;
      }

      // F8: Hold Cart
      if (e.key === 'F8') {
        e.preventDefault();
        if (items.length > 0) {
          setHoldCartDialogOpen(true);
        }
        return;
      }

      // F9: Recall Held Carts
      if (e.key === 'F9') {
        e.preventDefault();
        setHeldCartsModalOpen(true);
        return;
      }

      // Ctrl + Backspace: Clear Cart
      if (e.ctrlKey && e.key === 'Backspace' && !isInput) {
        e.preventDefault();
        if (items.length > 0 && window.confirm('Clear all items from current cart?')) {
          clearCart();
          toast.info('Cart cleared');
        }
        return;
      }

      // Esc: Close active modals
      if (e.key === 'Escape') {
        if (paymentModalOpen) setPaymentModalOpen(false);
        if (weighedProduct) setWeighedProduct(null);
        if (holdCartDialogOpen) setHoldCartDialogOpen(false);
        if (heldCartsModalOpen) setHeldCartsModalOpen(false);
        if (shortcutsModalOpen) setShortcutsModalOpen(false);
        if (completedSale) setCompletedSale(null);
        focusScanInput();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    items.length,
    isQuoteLoading,
    serverQuote.total_cents,
    paymentModalOpen,
    weighedProduct,
    holdCartDialogOpen,
    heldCartsModalOpen,
    shortcutsModalOpen,
    completedSale,
    clearCart,
    toast,
  ]);

  // Initial focus on mount
  useEffect(() => {
    focusScanInput();
  }, []);

  // Handle Parking Cart (F8)
  const handleConfirmHoldCart = async (label: string) => {
    try {
      await holdCurrentCart(label, {
        items,
        billDiscount,
        customerPhone,
        customerName: '',
        sendSms: true,
      });
      clearCart();
      queryClient.invalidateQueries({ queryKey: ['held-carts'] });
      toast.success(`Cart parked as "${label}". Press F9 to recall.`);
      focusScanInput();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to hold cart');
    }
  };

  // Handle Restoring Held Cart (F9)
  const handleRestoreHeldCart = (held: HeldCartRow) => {
    restoreCart({
      items: held.cart_json.items,
      billDiscount: held.cart_json.billDiscount,
      customerPhone: held.cart_json.customerPhone,
      customerName: held.cart_json.customerName,
      sendSms: held.cart_json.sendSms,
    });
    toast.success(`Restored cart: ${held.label}`);
    focusScanInput();
  };

  // Handle Successful Checkout
  const handleSaleSuccess = (sale: SaleCheckoutResult) => {
    setPaymentModalOpen(false);
    clearCart();
    setCompletedSale(sale);
    queryClient.invalidateQueries({ queryKey: ['pos-products'] });
  };

  const { isOpen: isShiftOpen, isLoading: isShiftLoading, refetch: refetchShift } = useCurrentShift();

  if (isShiftLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 text-slate-500 font-mono text-sm">
        Verifying cashier shift status...
      </div>
    );
  }

  if (!isShiftOpen) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <ShiftGate onShiftOpened={() => refetchShift()} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-100 dark:bg-slate-950 overflow-hidden transition-subtle">
      {/* Top POS Action Toolbar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2.5 flex items-center justify-between flex-shrink-0 shadow-subtle">
        <div className="flex items-center space-x-3">
          <div className="font-extrabold text-slate-800 dark:text-slate-100 text-sm flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-500 animate-pulse" />
            <span>Wewala Register</span>
          </div>

          <span className="text-slate-300 dark:text-slate-700">|</span>

          {/* Parked Carts Shortcut Button */}
          <button
            type="button"
            onClick={() => setHeldCartsModalOpen(true)}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-subtle cursor-pointer"
          >
            <PlayCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Recall Carts (F9)</span>
          </button>

          <button
            type="button"
            disabled={items.length === 0}
            onClick={() => setHoldCartDialogOpen(true)}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-40 transition-subtle cursor-pointer"
          >
            <PauseCircle className="w-3.5 h-3.5 text-slate-500" />
            <span>Hold (F8)</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          {/* Scanner Status Chip */}
          <div className="hidden sm:inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-brand-50 dark:bg-brand-950/80 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800 shadow-subtle">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
            <span>Ready to scan</span>
          </div>

          {/* Mute / Unmute Audio Feedback */}
          <button
            type="button"
            onClick={() => {
              const muted = soundEffects.toggleMute();
              setIsMuted(muted);
              toast.info(muted ? 'Scanner beeps muted' : 'Scanner beeps unmuted');
            }}
            title={isMuted ? 'Unmute scanner sounds' : 'Mute scanner sounds'}
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-subtle cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-500" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Keyboard Shortcuts Cheat Sheet */}
          <button
            type="button"
            onClick={() => {
              window.open('/customer-display', 'WewalaCustomerDisplay', 'width=1024,height=768,menubar=no,toolbar=no');
            }}
            title="Open Customer-Facing Display in new window"
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-subtle cursor-pointer"
          >
            <Monitor className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setShortcutsModalOpen(true)}
            title="Keyboard shortcuts (cheat-sheet)"
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-subtle cursor-pointer"
          >
            <Keyboard className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Checkout View: Desktop 65% Left / 35% Right */}
      <div className="flex-1 flex flex-col lg:flex-row p-3 gap-3 overflow-hidden">
        {/* =================================================================== */}
        {/* LEFT COLUMN: SCANNER / SEARCH INPUT & PRODUCT GRID (65%)            */}
        {/* =================================================================== */}
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-subtle p-3.5 overflow-hidden">
          {/* Always-Focused Barcode / SKU / Search Bar */}
          <div className="relative mb-3 flex-shrink-0">
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-600 dark:text-brand-400">
                <Barcode className="w-5 h-5" />
              </span>
              <input
                ref={scanInputRef}
                type="text"
                value={scanQuery}
                onChange={(e) => {
                  setScanQuery(e.target.value);
                  setScanNotFoundMsg(null);
                }}
                onKeyDown={handleScanInputKeyDown}
                placeholder="Scan barcode or type name / SKU (F2 to focus)..."
                className="w-full pl-11 pr-24 py-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-subtle shadow-subtle"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                {isSearching && (
                  <span className="text-[11px] text-slate-400 animate-pulse font-mono">
                    Searching...
                  </span>
                )}
                <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 rounded border border-slate-300 dark:border-slate-700 shadow-subtle select-none">
                  F2
                </kbd>
              </div>
            </div>

            {/* Scan Error Notice */}
            {scanNotFoundMsg && (
              <div className="mt-2 p-2 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 rounded-xl text-xs flex items-center space-x-2 animate-shake">
                <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                <span className="font-semibold">{scanNotFoundMsg}</span>
              </div>
            )}

            {/* Instant Search Dropdown (when typing keyword) */}
            {debouncedSearch.length > 0 && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-overlay z-20 max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {searchResults.map((prod, idx) => {
                  const stock = Number(prod.stock_qty);
                  const isOutOfStock = stock <= 0;
                  const isSelected = idx === selectedIndex;

                  return (
                    <div
                      key={prod.id}
                      onClick={() => {
                        if (!isOutOfStock) {
                          handleAddProduct(prod);
                        } else {
                          soundEffects.playErrorBeep();
                          toast.error(`"${prod.name}" is out of stock.`);
                        }
                      }}
                      className={`p-2.5 flex items-center justify-between cursor-pointer transition-subtle ${
                        isSelected ? 'bg-brand-50 dark:bg-brand-950/60' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      } ${
                        isOutOfStock ? 'opacity-40 grayscale bg-slate-100 dark:bg-slate-950 cursor-not-allowed select-none' : ''
                      }`}
                    >
                      <div>
                        <div className="font-bold text-xs text-slate-900 dark:text-slate-100">{prod.name}</div>
                        <div className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                          SKU: {prod.sku} {prod.barcode && `• Barcode: ${prod.barcode}`}
                        </div>
                      </div>

                      <div className="text-right">
                        <Money size="sm" cents={prod.selling_price_cents} />
                        <div
                          className={`text-[10px] font-mono ${isOutOfStock ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-500 dark:text-slate-400'
                            }`}
                        >
                          {isOutOfStock ? 'Out of stock' : `${stock} ${prod.unit} left`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Catalog & Category Grid */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <ProductGrid
              products={catalog}
              isLoading={isCatalogLoading}
              onSelectProduct={handleAddProduct}
            />
          </div>
        </div>

        {/* =================================================================== */}
        {/* RIGHT COLUMN: ACTIVE CART & TOTALS (35% Desktop / Drawer on Tablet) */}
        {/* =================================================================== */}
        <div className="hidden lg:flex lg:w-[380px] xl:w-[420px] flex-col flex-shrink-0 overflow-hidden">
          <CartPanel
            serverQuote={serverQuote}
            isQuoteLoading={isQuoteLoading}
            onOpenPayment={() => setPaymentModalOpen(true)}
            phoneInputRef={phoneInputRef}
          />
        </div>

        {/* Tablet / Mobile Sticky Bottom Bar (Slides up cart) */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-slate-900 text-white p-3 border-t border-slate-800 shadow-2xl flex items-center justify-between z-30">
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400">
              {items.length} items
            </div>
            <div className="text-xl font-mono font-black text-emerald-400">
              {formatLKR(serverQuote.total_cents)}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMobileCartOpen(!mobileCartOpen)}
              className="text-white border-slate-700 hover:bg-slate-800"
            >
              <ShoppingBag className="w-4 h-4 mr-1" />
              <span>{mobileCartOpen ? 'Hide Cart' : 'View Cart'}</span>
            </Button>

            <Button
              variant="primary"
              size="sm"
              disabled={items.length === 0 || isQuoteLoading}
              onClick={() => setPaymentModalOpen(true)}
              className="font-bold px-4"
            >
              Pay (F4)
            </Button>
          </div>
        </div>

        {/* Tablet Slide-up Drawer */}
        {mobileCartOpen && (
          <div className="lg:hidden fixed inset-x-0 bottom-16 top-20 bg-white z-20 shadow-2xl p-3 border-t border-slate-300 overflow-hidden">
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-200">
              <span className="font-bold text-sm text-slate-900">Cart Details</span>
              <button
                type="button"
                onClick={() => setMobileCartOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <ChevronUp className="w-5 h-5 rotate-180" />
              </button>
            </div>
            <div className="h-[calc(100%-40px)]">
              <CartPanel
                serverQuote={serverQuote}
                isQuoteLoading={isQuoteLoading}
                onOpenPayment={() => {
                  setMobileCartOpen(false);
                  setPaymentModalOpen(true);
                }}
                phoneInputRef={phoneInputRef}
              />
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* MODALS                                                                */}
      {/* ===================================================================== */}
      {/* 1. Weighed / Decimal Quantity Prompt */}
      {weighedProduct && (
        <QuantityModal
          isOpen={Boolean(weighedProduct)}
          onClose={() => {
            setWeighedProduct(null);
            focusScanInput();
          }}
          product={weighedProduct}
          onConfirm={(qty) => handleAddProduct(weighedProduct, qty)}
        />
      )}

      {/* 2. Payment Checkout Modal (F4) */}
      {paymentModalOpen && (
        <PaymentModal
          isOpen={paymentModalOpen}
          onClose={() => {
            setPaymentModalOpen(false);
            focusScanInput();
          }}
          serverQuote={serverQuote}
          onSaleSuccess={handleSaleSuccess}
          onStockErrorRefresh={() => {
            refetchCatalog();
          }}
        />
      )}

      {/* 3. Park / Hold Cart Prompt (F8) */}
      {holdCartDialogOpen && (
        <HoldCartDialog
          isOpen={holdCartDialogOpen}
          onClose={() => {
            setHoldCartDialogOpen(false);
            focusScanInput();
          }}
          onConfirm={handleConfirmHoldCart}
          itemCount={items.length}
        />
      )}

      {/* 4. Recall Held Carts (F9) */}
      {heldCartsModalOpen && (
        <HeldCartsModal
          isOpen={heldCartsModalOpen}
          onClose={() => {
            setHeldCartsModalOpen(false);
            focusScanInput();
          }}
          onRestore={handleRestoreHeldCart}
        />
      )}

      {/* 5. Keyboard Shortcuts Cheat Sheet */}
      {shortcutsModalOpen && (
        <KeyboardShortcutsModal
          isOpen={shortcutsModalOpen}
          onClose={() => {
            setShortcutsModalOpen(false);
            focusScanInput();
          }}
        />
      )}

      {/* 6. Sale Completed Confirmation & Change Due */}
      {completedSale && (
        <SaleSuccessModal
          isOpen={Boolean(completedSale)}
          onClose={() => {
            setCompletedSale(null);
            focusScanInput();
          }}
          sale={completedSale}
        />
      )}
    </div>
  );
};

export default POSPage;
