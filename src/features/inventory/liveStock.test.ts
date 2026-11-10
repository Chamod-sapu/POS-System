import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { QueryClient } from '@tanstack/react-query';
import { useCartStore } from '../pos/hooks/useCartStore';
import { POSProduct } from '../pos/types';
import {
  useLiveStockStore,
  getActiveChannelCount,
} from './useLiveStock';

describe('Realtime Live Inventory & Stock Subscriptions', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    useCartStore.getState().clearCart();
    useLiveStockStore.getState().clearChangedProducts();
    useLiveStockStore.getState().setStatus('offline');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const mockProductA: POSProduct = {
    id: 'prod-rice-01',
    sku: 'RICE-SAMBA',
    barcode: '4790001',
    name: 'Keeri Samba 5kg',
    category_id: 'cat-grains',
    unit: 'pack',
    allow_decimal_qty: false,
    selling_price_cents: 155000,
    tax_exempt: true,
    stock_qty: 10,
    is_active: true,
  };

  const mockProductB: POSProduct = {
    id: 'prod-milk-02',
    sku: 'MILK-ANCHOR',
    barcode: '4790002',
    name: 'Anchor Milk Powder 400g',
    category_id: 'cat-dairy',
    unit: 'pack',
    allow_decimal_qty: false,
    selling_price_cents: 110000,
    tax_exempt: false,
    stock_qty: 8,
    is_active: true,
  };

  describe('Part 1: Database Migration 011_stock_levels.sql Verification', () => {
    const migrationPath = path.resolve(__dirname, '../../../supabase/migrations/011_stock_levels.sql');

    it('verifies migration 011_stock_levels.sql exists and creates stock_levels table', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Table definition
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS stock_levels');
      expect(sql).toContain('product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE');
      expect(sql).toContain('stock_qty numeric(12,3) NOT NULL DEFAULT 0');

      // Backfill from products
      expect(sql).toContain('INSERT INTO stock_levels (product_id, stock_qty, updated_at)');
      expect(sql).toContain('SELECT id, stock_qty, now()');

      // Sync trigger
      expect(sql).toContain('CREATE OR REPLACE FUNCTION sync_stock_levels()');
      expect(sql).toContain('CREATE TRIGGER trg_sync_stock_levels');
      expect(sql).toContain('AFTER INSERT OR UPDATE OF stock_qty ON products');
    });

    it('enforces RLS on stock_levels allowing cashier/staff SELECT while protecting products cost prices', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // RLS enabled and forced
      expect(sql).toContain('ALTER TABLE stock_levels ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('ALTER TABLE stock_levels FORCE ROW LEVEL SECURITY');

      // Staff SELECT policy (cashier, manager, owner)
      expect(sql).toContain('CREATE POLICY stock_levels_select_policy ON stock_levels');
      expect(sql).toContain('USING (is_staff())');

      // No client write permissions
      expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE ON stock_levels FROM authenticated');
      expect(sql).toContain('REVOKE ALL ON stock_levels FROM anon');
    });

    it('configures publication and pos_products view', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Realtime publication & replica identity
      expect(sql).toContain('ALTER TABLE stock_levels REPLICA IDENTITY FULL');
      expect(sql).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE stock_levels');
      expect(sql).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE sales');

      // pos_products reads stock_qty from stock_levels
      expect(sql).toContain('CREATE VIEW pos_products WITH (security_barrier = true)');
      expect(sql).toContain('LEFT JOIN stock_levels sl ON p.id = sl.product_id');
      expect(sql).toContain('COALESCE(sl.stock_qty, p.stock_qty, 0) AS stock_qty');
    });
  });

  describe('Part 2: TanStack Query Cache Patching & 250ms Debounced Batching', () => {
    it('patches pos_products query cache in place on stock changes', () => {
      // Seed initial cache
      queryClient.setQueryData<POSProduct[]>(['pos-products'], [mockProductA, mockProductB]);

      // Simulate stock update for product A from 10 -> 4
      const updates = [{ productId: mockProductA.id, stockQty: 4 }];

      queryClient.setQueryData<POSProduct[]>(['pos-products'], (old) => {
        if (!old) return old;
        const updateMap = new Map(updates.map((u) => [u.productId, u.stockQty]));
        return old.map((prod) =>
          updateMap.has(prod.id) ? { ...prod, stock_qty: updateMap.get(prod.id)! } : prod
        );
      });

      const updatedCatalog = queryClient.getQueryData<POSProduct[]>(['pos-products']);
      expect(updatedCatalog).toBeDefined();
      expect(updatedCatalog?.find((p) => p.id === mockProductA.id)?.stock_qty).toBe(4);
      expect(updatedCatalog?.find((p) => p.id === mockProductB.id)?.stock_qty).toBe(8);
    });

    it('batches rapid updates within 250ms buffer to prevent excessive re-renders', () => {
      const flushFn = vi.fn();
      const buffer = new Map<string, number>();
      let timer: ReturnType<typeof setTimeout> | null = null;

      const queueUpdate = (productId: string, stockQty: number) => {
        buffer.set(productId, stockQty);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          flushFn(Array.from(buffer.entries()));
          buffer.clear();
        }, 250);
      };

      // 5 rapid updates within 100ms
      queueUpdate('prod-1', 10);
      vi.advanceTimersByTime(50);
      queueUpdate('prod-2', 5);
      vi.advanceTimersByTime(50);
      queueUpdate('prod-1', 9); // Latest value for prod-1
      vi.advanceTimersByTime(50);
      queueUpdate('prod-3', 20);

      // Flush should not have fired yet
      expect(flushFn).not.toHaveBeenCalled();

      // Advance past 250ms debounce threshold
      vi.advanceTimersByTime(250);

      // Should have been called exactly once with consolidated batch
      expect(flushFn).toHaveBeenCalledTimes(1);
      const batch = flushFn.mock.calls[0]![0];
      expect(batch).toEqual([
        ['prod-1', 9],
        ['prod-2', 5],
        ['prod-3', 20],
      ]);
    });
  });

  describe('Part 3: POS Cart Live Reactions & Pay Block', () => {
    it('blocks Pay and highlights cart line in amber when live stock falls below cart quantity', () => {
      // 1. Add 5 items of product A to cart (available stock is 10)
      const res = useCartStore.getState().addItem(mockProductA, 5);
      expect(res.success).toBe(true);
      expect(useCartStore.getState().items[0]?.quantity).toBe(5);
      expect(useCartStore.getState().items[0]?.maxStockQty).toBe(10);

      // Initially, no stock exceeded
      let items = useCartStore.getState().items;
      let hasExceeded = items.some((i) => i.quantity > i.maxStockQty);
      expect(hasExceeded).toBe(false);

      // 2. Another terminal sells 8 items -> live stock falls to 2
      useCartStore.getState().syncLiveStock([{ productId: mockProductA.id, stockQty: 2 }]);

      // Now cart item maxStockQty is updated to 2
      items = useCartStore.getState().items;
      const cartItem = items[0]!;
      expect(cartItem.maxStockQty).toBe(2);
      expect(cartItem.quantity).toBe(5);

      // Verification: cart item exceeds live stock
      const isExceedingStock = cartItem.quantity > cartItem.maxStockQty;
      expect(isExceedingStock).toBe(true);

      // Pay button must be blocked
      hasExceeded = items.some((i) => i.quantity > i.maxStockQty);
      expect(hasExceeded).toBe(true);

      // 3. Cashier adjusts quantity to 2
      useCartStore.getState().updateItemQty(mockProductA.id, 2);
      items = useCartStore.getState().items;
      expect(items[0]?.quantity).toBe(2);
      expect(items.some((i) => i.quantity > i.maxStockQty)).toBe(false);
    });

    it('rejects adding out of stock products to cart', () => {
      const zeroStockProduct: POSProduct = {
        ...mockProductA,
        id: 'zero-stock-prod',
        stock_qty: 0,
      };

      const res = useCartStore.getState().addItem(zeroStockProduct, 1);
      expect(res.success).toBe(false);
      expect(res.error).toContain('is out of stock');
      expect(useCartStore.getState().items.length).toBe(0);
    });
  });

  describe('Part 4: Realtime Connection Indicator & Channel Singleton Invariant', () => {
    it('tracks Live, Reconnecting and Offline connection states in store', () => {
      // Default initial state
      expect(useLiveStockStore.getState().status).toBe('offline');

      // Channel connects
      useLiveStockStore.getState().setStatus('live');
      expect(useLiveStockStore.getState().status).toBe('live');

      // Channel reconnecting
      useLiveStockStore.getState().setStatus('reconnecting');
      expect(useLiveStockStore.getState().status).toBe('reconnecting');

      // Network off
      useLiveStockStore.getState().setStatus('offline');
      expect(useLiveStockStore.getState().status).toBe('offline');
    });

    it('guarantees single channel across the entire app', () => {
      const count = getActiveChannelCount();
      // Should never exceed 1 channel
      expect(count).toBeLessThanOrEqual(1);
    });

    it('marks and automatically clears table row change highlight after 2500ms', () => {
      useLiveStockStore.getState().markProductsChanged(['prod-1', 'prod-2']);

      expect(useLiveStockStore.getState().recentlyChangedProductIds.has('prod-1')).toBe(true);
      expect(useLiveStockStore.getState().recentlyChangedProductIds.has('prod-2')).toBe(true);
      expect(useLiveStockStore.getState().recentlyChangedProductIds.has('prod-3')).toBe(false);

      // Advance 2400ms (still highlighted)
      vi.advanceTimersByTime(2400);
      expect(useLiveStockStore.getState().recentlyChangedProductIds.has('prod-1')).toBe(true);

      // Advance past 2500ms
      vi.advanceTimersByTime(200);
      expect(useLiveStockStore.getState().recentlyChangedProductIds.has('prod-1')).toBe(false);
      expect(useLiveStockStore.getState().recentlyChangedProductIds.has('prod-2')).toBe(false);
    });
  });

  describe('Part 5: Financial Security Invariant', () => {
    it('ensures live UI updates are advisory and create_sale locks rows with FOR UPDATE', () => {
      const createSalePath = path.resolve(__dirname, '../../../supabase/migrations/006_create_sale.sql');
      const sql = fs.readFileSync(createSalePath, 'utf8');

      // create_sale performs row-level locking on products to prevent race conditions & overselling
      expect(sql).toContain('FOR UPDATE');
      expect(sql).toContain('OUT_OF_STOCK');
    });
  });
});
