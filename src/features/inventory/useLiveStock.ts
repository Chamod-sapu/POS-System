import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient, QueryClient } from '@tanstack/react-query';
import { RealtimeChannel } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/hooks/useAuth';
import { useCartStore } from '../pos/hooks/useCartStore';
import { POSProduct } from '../pos/types';
import { ProductWithCategory } from '../products/types';
import { useToast } from '../../components/ui/Toast';

export type LiveConnectionStatus = 'live' | 'reconnecting' | 'offline';

export interface LiveStockStoreState {
  status: LiveConnectionStatus;
  recentlyChangedProductIds: Set<string>;
  setStatus: (status: LiveConnectionStatus) => void;
  markProductsChanged: (productIds: string[]) => void;
  clearChangedProducts: () => void;
}

export const useLiveStockStore = create<LiveStockStoreState>((set) => ({
  status: 'offline',
  recentlyChangedProductIds: new Set<string>(),
  setStatus: (status) => set({ status }),
  markProductsChanged: (productIds) => {
    if (productIds.length === 0) return;
    set((state) => {
      const next = new Set(state.recentlyChangedProductIds);
      productIds.forEach((id) => next.add(id));
      return { recentlyChangedProductIds: next };
    });

    // Automatically remove after 2500ms
    setTimeout(() => {
      set((state) => {
        const next = new Set(state.recentlyChangedProductIds);
        productIds.forEach((id) => next.delete(id));
        return { recentlyChangedProductIds: next };
      });
    }, 2500);
  },
  clearChangedProducts: () => set({ recentlyChangedProductIds: new Set<string>() }),
}));

// Channel singleton state across navigation
let globalRealtimeChannel: RealtimeChannel | null = null;
let activeSubscriberCount = 0;

/**
 * Returns the active channel count for logging & testing
 */
export function getActiveChannelCount(): number {
  if (typeof supabase?.getChannels === 'function') {
    return supabase.getChannels().length;
  }
  return globalRealtimeChannel ? 1 : 0;
}

/**
 * Global hook to manage Realtime updates for stock_levels and sales.
 * Ensures only ONE single Realtime channel exists across the entire app.
 */
export function useLiveStock() {
  let queryClient: QueryClient | undefined;
  try {
    queryClient = useQueryClient();
  } catch {
    queryClient = undefined;
  }
  const { user, role } = useAuth();
  let toast: ReturnType<typeof useToast> | undefined;
  try {
    toast = useToast();
  } catch {
    toast = undefined;
  }

  const batchBufferRef = useRef<Map<string, number>>(new Map());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notifiedLowStockRef = useRef<Set<string>>(new Set());

  // 1. Refetch all stock data upon connect or reconnect
  const refetchMissedStock = useCallback(() => {
    queryClient?.invalidateQueries({ queryKey: ['pos-products'] });
    queryClient?.invalidateQueries({ queryKey: ['pos-search'] });
    queryClient?.invalidateQueries({ queryKey: ['products'] });
    queryClient?.invalidateQueries({ queryKey: ['stocktake-products'] });
    queryClient?.invalidateQueries({ queryKey: ['search-products-adjust'] });
  }, [queryClient]);

  // 2. Flush buffered stock changes after 250ms
  const flushBatch = useCallback(() => {
    if (batchBufferRef.current.size === 0) return;

    const updates = Array.from(batchBufferRef.current.entries()).map(([productId, stockQty]) => ({
      productId,
      stockQty,
    }));
    batchBufferRef.current.clear();

    // Visual pulse marking for tables
    useLiveStockStore.getState().markProductsChanged(updates.map((u) => u.productId));

    if (queryClient) {
      // A. In-place patch pos_products
      queryClient.setQueryData<POSProduct[]>(['pos-products'], (old) => {
        if (!old) return old;
        const updateMap = new Map(updates.map((u) => [u.productId, u.stockQty]));
        return old.map((prod) => {
          if (updateMap.has(prod.id)) {
            return { ...prod, stock_qty: updateMap.get(prod.id)! };
          }
          return prod;
        });
      });

      // B. In-place patch pos-search queries
      queryClient.setQueriesData<POSProduct[]>({ queryKey: ['pos-search'] }, (old) => {
        if (!old) return old;
        const updateMap = new Map(updates.map((u) => [u.productId, u.stockQty]));
        return old.map((prod) => {
          if (updateMap.has(prod.id)) {
            return { ...prod, stock_qty: updateMap.get(prod.id)! };
          }
          return prod;
        });
      });

      // C. In-place patch products queries
      queryClient.setQueriesData<{ products: ProductWithCategory[]; totalCount: number }>(
        { queryKey: ['products'] },
        (old) => {
          if (!old || !old.products) return old;
          const updateMap = new Map(updates.map((u) => [u.productId, u.stockQty]));
          return {
            ...old,
            products: old.products.map((prod) => {
              if (updateMap.has(prod.id)) {
                return { ...prod, stock_qty: updateMap.get(prod.id)! };
              }
              return prod;
            }),
          };
        }
      );

      // D. In-place patch stocktake-products queries
      queryClient.setQueriesData<{ products: ProductWithCategory[]; totalCount: number }>(
        { queryKey: ['stocktake-products'] },
        (old) => {
          if (!old || !old.products) return old;
          const updateMap = new Map(updates.map((u) => [u.productId, u.stockQty]));
          return {
            ...old,
            products: old.products.map((prod) => {
              if (updateMap.has(prod.id)) {
                return { ...prod, stock_qty: updateMap.get(prod.id)! };
              }
              return prod;
            }),
          };
        }
      );
    }

    // E. Sync live stock with active cart
    useCartStore.getState().syncLiveStock(updates);

    // F. Reorder level warning toast for managers & owners
    if (role === 'manager' || role === 'owner') {
      const productsQueries = queryClient
        ? queryClient.getQueriesData<{ products: ProductWithCategory[] }>({
            queryKey: ['products'],
          })
        : [];
      const catalog = queryClient?.getQueryData<POSProduct[]>(['pos-products']);

      updates.forEach(({ productId, stockQty }) => {
        let prodName: string | undefined;
        let unit: string = 'units';
        let reorderLevel: number | undefined;

        for (const [, data] of productsQueries) {
          const found = data?.products?.find((p) => p.id === productId);
          if (found) {
            prodName = found.name;
            unit = found.unit;
            reorderLevel = Number(found.reorder_level);
            break;
          }
        }

        if (!prodName && catalog) {
          const foundPos = catalog.find((p) => p.id === productId);
          if (foundPos) {
            prodName = foundPos.name;
            unit = foundPos.unit;
          }
        }

        if (prodName && reorderLevel !== undefined) {
          if (stockQty <= reorderLevel) {
            if (!notifiedLowStockRef.current.has(productId)) {
              notifiedLowStockRef.current.add(productId);
              toast?.warning(
                `Low Stock Alert: "${prodName}" is now at ${stockQty} ${unit} (Reorder level: ${reorderLevel})`
              );
            }
          } else {
            notifiedLowStockRef.current.delete(productId);
          }
        }
      });
    }
  }, [queryClient, role, toast]);

  // 3. Queue an incoming stock change with 250ms batch buffer
  const queueStockChange = useCallback(
    (record: { product_id: string; stock_qty: number | string }) => {
      const qty = Number(record.stock_qty);
      batchBufferRef.current.set(record.product_id, qty);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        flushBatch();
      }, 250);
    },
    [flushBatch]
  );

  // 4. Handle sale INSERT (for managers & owners)
  const handleSaleInserted = useCallback(() => {
    queryClient?.invalidateQueries({ queryKey: ['sales'] });
    queryClient?.invalidateQueries({ queryKey: ['today-sales-stats'] });
    queryClient?.invalidateQueries({ queryKey: ['reports'] });
    queryClient?.invalidateQueries({ queryKey: ['recent-bills'] });
  }, [queryClient]);

  // 5. Fallback polling every 15s if channel errors out
  const pollStockLevels = useCallback(async () => {
    try {
      // Cashiers have SELECT permission on stock_levels under RLS
      const { data, error } = await supabase.from('stock_levels').select('product_id, stock_qty');
      if (!error && Array.isArray(data)) {
        data.forEach((row) => {
          batchBufferRef.current.set(row.product_id, Number(row.stock_qty));
        });
        flushBatch();
      }
    } catch (err) {
      console.warn('[Realtime] Polling fallback error:', err);
    }
  }, [flushBatch]);

  // 6. Network online / offline event handlers
  useEffect(() => {
    const handleOnline = () => {
      useLiveStockStore.getState().setStatus('reconnecting');
      refetchMissedStock();
    };

    const handleOffline = () => {
      useLiveStockStore.getState().setStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refetchMissedStock]);

  // 7. Channel Subscription Lifecycle (Created once on login, removed on logout)
  useEffect(() => {
    if (!user) {
      if (globalRealtimeChannel) {
        supabase.removeChannel(globalRealtimeChannel);
        globalRealtimeChannel = null;
        activeSubscriberCount = 0;
        useLiveStockStore.getState().setStatus('offline');
      }
      return;
    }

    activeSubscriberCount++;

    if (!globalRealtimeChannel) {
      useLiveStockStore.getState().setStatus('reconnecting');

      const channel = supabase.channel('realtime:stock-and-sales');

      // Listen to stock_levels for ALL staff (including cashiers)
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stock_levels',
        },
        (payload) => {
          if (payload.new && typeof payload.new === 'object' && 'product_id' in payload.new) {
            queueStockChange(payload.new as { product_id: string; stock_qty: number });
          }
        }
      );

      // Listen to sales INSERT for managers and owners
      if (role === 'manager' || role === 'owner') {
        channel.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'sales',
          },
          () => {
            handleSaleInserted();
          }
        );
      }

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          useLiveStockStore.getState().setStatus('live');
          refetchMissedStock();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          useLiveStockStore.getState().setStatus('reconnecting');
        } else if (status === 'CLOSED') {
          useLiveStockStore.getState().setStatus('offline');
        }

        if (import.meta.env.DEV) {
          console.log('[Realtime] Subscription state:', status, '| Channels count:', getActiveChannelCount());
        }
      });

      globalRealtimeChannel = channel;
    }

    if (import.meta.env.DEV) {
      console.log('[Realtime] Active channels count:', getActiveChannelCount());
    }

    return () => {
      activeSubscriberCount--;
      if (activeSubscriberCount <= 0 && globalRealtimeChannel) {
        supabase.removeChannel(globalRealtimeChannel);
        globalRealtimeChannel = null;
        activeSubscriberCount = 0;
        useLiveStockStore.getState().setStatus('offline');
        if (import.meta.env.DEV) {
          console.log('[Realtime] Teardown complete. Channels count:', getActiveChannelCount());
        }
      }
    };
  }, [user, role, queueStockChange, handleSaleInserted, refetchMissedStock]);

  // 8. 15s Polling Fallback when channel status is not live
  const currentStatus = useLiveStockStore((s) => s.status);

  useEffect(() => {
    if (currentStatus === 'offline' || currentStatus === 'reconnecting') {
      if (!pollingIntervalRef.current) {
        pollingIntervalRef.current = setInterval(() => {
          pollStockLevels();
        }, 15000);
      }
    } else {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [currentStatus, pollStockLevels]);

  return {
    status: currentStatus,
    recentlyChangedProductIds: useLiveStockStore((s) => s.recentlyChangedProductIds),
    refetchMissedStock,
    queueStockChange,
    flushBatch,
  };
}
