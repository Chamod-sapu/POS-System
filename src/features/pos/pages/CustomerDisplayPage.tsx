import React, { useState, useEffect, useRef } from 'react';
import {
  Store,
  CheckCircle2,
  Maximize2,
  Clock,
  Sparkles,
  ShoppingBag,
  Coins,
} from 'lucide-react';
import { Money } from '../../../components/ui/Money';
import { useShopSettings } from '../../settings/hooks/useShopSettings';
import {
  CustomerDisplayItem,
  CustomerDisplayMessage,
} from '../lib/customerDisplayBroadcast';

export const CustomerDisplayPage: React.FC = () => {
  const { shopName } = useShopSettings();
  const [items, setItems] = useState<CustomerDisplayItem[]>([]);
  const [totalCents, setTotalCents] = useState<number>(0);
  const [saleResult, setSaleResult] = useState<{
    billNo: string;
    totalCents: number;
    changeDueCents: number;
  } | null>(null);
  const [countdownRemaining, setCountdownRemaining] = useState<number>(15);
  const [currentTime, setCurrentTime] = useState<string>('');

  // Clock
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-LK', {
          timeZone: 'Asia/Colombo',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  // BroadcastChannel Listener
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;

    const channel = new BroadcastChannel('wewala-customer-display');

    channel.onmessage = (event: MessageEvent<CustomerDisplayMessage>) => {
      const msg = event.data;
      if (!msg) return;

      if (msg.type === 'CART_UPDATE') {
        setItems(msg.items);
        setTotalCents(msg.totalCents);
        setSaleResult(null);
      } else if (msg.type === 'SALE_COMPLETED') {
        setSaleResult({
          billNo: msg.billNo,
          totalCents: msg.totalCents,
          changeDueCents: msg.changeDueCents,
        });
        setItems([]);
        setTotalCents(0);
        setCountdownRemaining(15);
      } else if (msg.type === 'RESET') {
        setItems([]);
        setTotalCents(0);
        setSaleResult(null);
      }
    };

    return () => {
      channel.close();
    };
  }, []);

  // 15s Countdown after sale completed
  useEffect(() => {
    if (!saleResult) return;

    const interval = setInterval(() => {
      setCountdownRemaining((prev) => {
        if (prev <= 1) {
          setSaleResult(null);
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [saleResult]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const customLogo = typeof window !== 'undefined' ? localStorage.getItem('wewala_shop_logo') : null;

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col font-sans select-none overflow-hidden">
      {/* Top Header Bar */}
      <header className="h-20 bg-slate-950 border-b border-slate-800 px-6 sm:px-10 flex items-center justify-between shadow-subtle shrink-0">
        <div className="flex items-center space-x-4">
          {customLogo ? (
            <img
              src={customLogo}
              alt="Logo"
              className="w-12 h-12 rounded-xl object-contain bg-white p-1 border border-slate-700 shadow-raised shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center text-white shadow-raised shrink-0">
              <Store className="w-6 h-6" />
            </div>
          )}
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-tight">
              {shopName || 'Wewala Supermarket'}
            </h1>
            <p className="text-xs text-brand-400 font-semibold uppercase tracking-wider">
              Customer Checkout Display • Wewala, Sri Lanka
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-6">
          <div className="hidden sm:flex items-center space-x-2 text-slate-400 font-mono text-sm bg-slate-900 px-3.5 py-1.5 rounded-xl border border-slate-800">
            <Clock className="w-4 h-4 text-brand-400" />
            <span className="tabular-nums font-bold text-white">{currentTime}</span>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            title="Toggle Fullscreen"
            className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors cursor-pointer"
          >
            <Maximize2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 sm:p-10 flex flex-col overflow-hidden">
        {saleResult ? (
          /* ================================================================ */
          /* THANK YOU / CHANGE DUE SCREEN                                     */
          /* ================================================================ */
          <div className="my-auto max-w-3xl mx-auto w-full text-center space-y-8 animate-in zoom-in-95 duration-300">
            <div className="w-24 h-24 rounded-3xl bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center border-2 border-emerald-500/40 shadow-overlay">
              <CheckCircle2 className="w-14 h-14" />
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-950 text-emerald-300 border border-emerald-800">
                Payment Received • Bill #{saleResult.billNo}
              </span>
              <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-white">
                Thank You for Shopping!
              </h2>
              <p className="text-slate-400 text-base">Please collect your change and printed receipt below.</p>
            </div>

            {/* Giant Change Due Card */}
            <div className="p-8 rounded-3xl bg-slate-950 border-2 border-brand-500/40 shadow-overlay space-y-3">
              <div className="flex items-center justify-center space-x-2 text-brand-400 text-sm font-bold uppercase tracking-widest">
                <Coins className="w-5 h-5" />
                <span>Change Due</span>
              </div>
              <div className="text-6xl sm:text-7xl font-mono font-black text-white tabular-nums tracking-tight">
                <Money cents={saleResult.changeDueCents} size="hero" className="text-emerald-400" />
              </div>
              <div className="text-xs text-slate-400 font-mono pt-2">
                Total Bill Amount: <Money cents={saleResult.totalCents} size="sm" className="text-white" />
              </div>
            </div>

            {/* Auto-Reset Countdown Bar */}
            <div className="space-y-2 pt-4 max-w-md mx-auto">
              <div className="flex justify-between text-xs font-mono text-slate-400">
                <span>Resetting terminal in:</span>
                <span className="font-bold text-white tabular-nums">{countdownRemaining}s</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-brand-500 transition-all duration-1000 ease-linear rounded-full"
                  style={{ width: `${(countdownRemaining / 15) * 100}%` }}
                />
              </div>
            </div>
          </div>
        ) : items.length === 0 ? (
          /* ================================================================ */
          /* IDLE / WELCOME SCREEN                                             */
          /* ================================================================ */
          <div className="my-auto max-w-2xl mx-auto w-full text-center space-y-6">
            <div className="w-24 h-24 rounded-3xl bg-brand-500/15 text-brand-400 mx-auto flex items-center justify-center border border-brand-500/30 shadow-raised">
              <ShoppingBag className="w-12 h-12" />
            </div>

            <div className="space-y-3">
              <span className="inline-flex items-center px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-brand-950/80 text-brand-300 border border-brand-800/80">
                <span className="w-2 h-2 rounded-full bg-brand-400 mr-2 animate-pulse" />
                Register Open • Ready for Next Customer
              </span>
              <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-white leading-tight">
                Welcome to {shopName || 'Wewala'}
              </h2>
              <p className="text-slate-400 text-sm sm:text-base max-w-lg mx-auto leading-relaxed">
                Please place your selected items on the counter or hand them to the cashier. Your scanned items and total will appear here in real time.
              </p>
            </div>
          </div>
        ) : (
          /* ================================================================ */
          /* ACTIVE CART SCREEN (Customer Scanned Items)                      */
          /* ================================================================ */
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 h-full overflow-hidden">
            {/* Scanned Items List */}
            <div className="lg:col-span-2 bg-slate-950 rounded-3xl border border-slate-800 shadow-subtle p-6 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-brand-400" />
                  Your Items ({items.length})
                </h3>
                <span className="text-xs font-mono text-slate-400">Live Itemized Bill</span>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80 pr-2 space-y-1">
                {items.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`py-4 px-3 rounded-2xl flex items-center justify-between transition-colors ${
                      idx === 0 ? 'bg-brand-500/10 border border-brand-500/20' : 'hover:bg-slate-900/40'
                    }`}
                  >
                    <div className="min-w-0 pr-4">
                      <h4 className="text-base sm:text-lg font-bold text-white truncate">{item.name}</h4>
                      <p className="text-xs sm:text-sm font-mono text-slate-400 mt-0.5">
                        <span className="text-brand-300 font-semibold">{item.quantity} {item.unit}</span> ×{' '}
                        <Money cents={item.unitPriceCents} size="sm" className="text-slate-300" />
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <Money cents={item.lineTotalCents} size="md" className="font-bold text-white tabular-nums" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Grand Total Summary Sidebar */}
            <div className="bg-slate-950 rounded-3xl border border-slate-800 shadow-subtle p-8 flex flex-col justify-between shrink-0">
              <div className="space-y-6">
                <div className="border-b border-slate-800 pb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Order Summary
                  </span>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-sm text-slate-400">Total Items:</span>
                    <span className="text-base font-mono font-bold text-white tabular-nums">
                      {items.reduce((sum, i) => sum + i.quantity, 0)}
                    </span>
                  </div>
                </div>

                <div className="p-6 rounded-2xl bg-brand-950/40 border border-brand-800/60 space-y-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-brand-300">
                    Total Amount Due
                  </span>
                  <div className="pt-1">
                    <Money cents={totalCents} size="hero" className="text-white text-4xl sm:text-5xl" />
                  </div>
                  <p className="text-[11px] text-slate-400 pt-1">Inclusive of all applicable taxes & discounts.</p>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-800/80 text-center space-y-1">
                <p className="text-xs text-slate-400 font-medium">Cash, Card, & QR Payments Accepted</p>
                <p className="text-[10px] text-slate-500 font-mono">Wewala POS System • Accurate to the cent</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default CustomerDisplayPage;

