import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { CartItem, POSProduct, BillDiscount } from '../types';
import { broadcastToCustomerDisplay } from '../lib/customerDisplayBroadcast';

interface CartState {
  items: CartItem[];
  billDiscount: BillDiscount;
  customerPhone: string;
  customerName: string;
  customerExists: boolean;
  customerOptedOut: boolean;
  customerPoints: number | null;
  sendSms: boolean;
  idempotencyKey: string | null;

  // Actions
  addItem: (product: POSProduct, quantity?: number) => { success: boolean; error?: string };
  updateItemQty: (productId: string, quantity: number) => { success: boolean; error?: string };
  updateItemDiscount: (
    productId: string,
    type: 'none' | 'percent' | 'amount',
    value: number
  ) => void;
  removeItem: (productId: string) => void;
  setBillDiscount: (discount: BillDiscount) => void;
  setCustomer: (
    phone: string,
    name?: string,
    exists?: boolean,
    optedOut?: boolean,
    points?: number | null
  ) => void;
  setSendSms: (send: boolean) => void;
  clearCart: () => void;
  getIdempotencyKey: () => string;
  resetIdempotencyKey: () => void;
  restoreCart: (savedCart: {
    items: CartItem[];
    billDiscount?: BillDiscount;
    customerPhone?: string;
    customerName?: string;
    sendSms?: boolean;
  }) => void;
  revalidateWithFreshCatalog: (catalog: POSProduct[]) => {
    outOfStockCount: number;
    priceChangedCount: number;
  };
  syncLiveStock: (updates: Array<{ productId: string; stockQty: number }>) => void;
}

function calculateItemLineTotal(
  unitPriceCents: number,
  quantity: number,
  discountType: 'none' | 'percent' | 'amount',
  discountValue: number
): number {
  const grossCents = Math.round(unitPriceCents * quantity);
  let discountCents = 0;
  if (discountType === 'percent') {
    discountCents = Math.round((grossCents * discountValue) / 100);
  } else if (discountType === 'amount') {
    discountCents = discountValue;
  }
  discountCents = Math.min(grossCents, Math.max(0, discountCents));
  return Math.max(0, grossCents - discountCents);
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      billDiscount: { type: 'none', value: 0 },
      customerPhone: '',
      customerName: '',
      customerExists: false,
      customerOptedOut: false,
      customerPoints: null,
      sendSms: false,
      idempotencyKey: null,

      addItem: (product: POSProduct, qtyToAdd = 1) => {
        const { items } = get();
        const existingIdx = items.findIndex((i) => i.productId === product.id);
        const availableStock = Number(product.stock_qty);

        if (availableStock <= 0) {
          return { success: false, error: `Product "${product.name}" is out of stock.` };
        }

        let newItems: CartItem[];

        if (existingIdx >= 0 && items[existingIdx]) {
          const existing = items[existingIdx]!;
          const newQty = existing.quantity + qtyToAdd;

          if (newQty > availableStock) {
            return {
              success: false,
              error: `Cannot add more. Only ${availableStock} ${product.unit} available in stock.`,
            };
          }

          const updatedItem: CartItem = {
            ...existing,
            quantity: newQty,
            maxStockQty: availableStock,
            localLineTotalCents: calculateItemLineTotal(
              existing.unitPriceCents,
              newQty,
              existing.discountType,
              existing.discountValue
            ),
          };

          newItems = [...items];
          newItems[existingIdx] = updatedItem;
        } else {
          if (qtyToAdd > availableStock) {
            return {
              success: false,
              error: `Only ${availableStock} ${product.unit} available in stock.`,
            };
          }

          const newItem: CartItem = {
            id: product.id,
            productId: product.id,
            sku: product.sku,
            barcode: product.barcode,
            name: product.name,
            unit: product.unit,
            unitPriceCents: product.selling_price_cents,
            quantity: qtyToAdd,
            allowDecimalQty: product.allow_decimal_qty,
            maxStockQty: availableStock,
            taxExempt: product.tax_exempt,
            discountType: 'none',
            discountValue: 0,
            localLineTotalCents: calculateItemLineTotal(
              product.selling_price_cents,
              qtyToAdd,
              'none',
              0
            ),
          };

          newItems = [...items, newItem];
        }

        // Invalidate idempotency key whenever cart items change
        set({ items: newItems, idempotencyKey: null });
        return { success: true };
      },

      updateItemQty: (productId: string, newQty: number) => {
        const { items } = get();
        if (newQty <= 0) {
          get().removeItem(productId);
          return { success: true };
        }

        const item = items.find((i) => i.productId === productId);
        if (!item) return { success: false, error: 'Item not in cart' };

        if (newQty > item.maxStockQty) {
          return {
            success: false,
            error: `Only ${item.maxStockQty} ${item.unit} available in stock.`,
          };
        }

        const updated = items.map((i) => {
          if (i.productId === productId) {
            return {
              ...i,
              quantity: newQty,
              localLineTotalCents: calculateItemLineTotal(
                i.unitPriceCents,
                newQty,
                i.discountType,
                i.discountValue
              ),
            };
          }
          return i;
        });

        set({ items: updated, idempotencyKey: null });
        return { success: true };
      },

      updateItemDiscount: (productId, type, value) => {
        const { items } = get();
        const updated = items.map((i) => {
          if (i.productId === productId) {
            return {
              ...i,
              discountType: type,
              discountValue: value,
              localLineTotalCents: calculateItemLineTotal(
                i.unitPriceCents,
                i.quantity,
                type,
                value
              ),
            };
          }
          return i;
        });

        set({ items: updated, idempotencyKey: null });
      },

      removeItem: (productId: string) => {
        const { items } = get();
        set({
          items: items.filter((i) => i.productId !== productId),
          idempotencyKey: null,
        });
      },

      setBillDiscount: (discount: BillDiscount) => {
        set({ billDiscount: discount, idempotencyKey: null });
      },

      setCustomer: (
        phone: string,
        name = '',
        exists = false,
        optedOut = false,
        points: number | null = null
      ) => {
        set({
          customerPhone: phone,
          customerName: name,
          customerExists: exists,
          customerOptedOut: optedOut,
          customerPoints: points,
          sendSms: optedOut ? false : get().sendSms,
        });
      },

      setSendSms: (send: boolean) => {
        const { customerOptedOut } = get();
        set({ sendSms: customerOptedOut ? false : send });
      },

      clearCart: () => {
        set({
          items: [],
          billDiscount: { type: 'none', value: 0 },
          customerPhone: '',
          customerName: '',
          customerExists: false,
          customerOptedOut: false,
          customerPoints: null,
          sendSms: false,
          idempotencyKey: null,
        });
      },

      getIdempotencyKey: () => {
        const { idempotencyKey } = get();
        if (idempotencyKey) return idempotencyKey;
        const newKey = crypto.randomUUID();
        set({ idempotencyKey: newKey });
        return newKey;
      },

      resetIdempotencyKey: () => {
        set({ idempotencyKey: null });
      },

      restoreCart: (savedCart) => {
        set({
          items: savedCart.items,
          billDiscount: savedCart.billDiscount || { type: 'none', value: 0 },
          customerPhone: savedCart.customerPhone || '',
          customerName: savedCart.customerName || '',
          sendSms: savedCart.sendSms ?? false,
          idempotencyKey: null,
        });
      },

      revalidateWithFreshCatalog: (catalog: POSProduct[]) => {
        const { items } = get();
        if (items.length === 0 || catalog.length === 0) {
          return { outOfStockCount: 0, priceChangedCount: 0 };
        }

        const catalogMap = new Map<string, POSProduct>();
        catalog.forEach((p) => catalogMap.set(p.id, p));

        let outOfStockCount = 0;
        let priceChangedCount = 0;

        const updatedItems = items.map((item) => {
          const fresh = catalogMap.get(item.productId);
          if (!fresh) return item;

          const freshStock = Number(fresh.stock_qty);
          const freshPrice = fresh.selling_price_cents;
          let clampedQty = item.quantity;
          let priceChanged = false;

          if (clampedQty > freshStock) {
            clampedQty = Math.max(0, freshStock);
            outOfStockCount++;
          }

          if (freshPrice !== item.unitPriceCents) {
            priceChanged = true;
            priceChangedCount++;
          }

          return {
            ...item,
            quantity: clampedQty,
            maxStockQty: freshStock,
            unitPriceCents: freshPrice,
            priceChanged,
            localLineTotalCents: calculateItemLineTotal(
              freshPrice,
              clampedQty,
              item.discountType,
              item.discountValue
            ),
          };
        }).filter((i) => i.quantity > 0);

        set({ items: updatedItems });
        return { outOfStockCount, priceChangedCount };
      },

      syncLiveStock: (updates: Array<{ productId: string; stockQty: number }>) => {
        const { items } = get();
        if (items.length === 0 || updates.length === 0) return;
        const updateMap = new Map(updates.map((u) => [u.productId, u.stockQty]));

        let hasChanged = false;
        const updatedItems = items.map((item) => {
          if (updateMap.has(item.productId)) {
            const newStock = updateMap.get(item.productId)!;
            if (item.maxStockQty !== newStock) {
              hasChanged = true;
              return {
                ...item,
                maxStockQty: newStock,
              };
            }
          }
          return item;
        });

        if (hasChanged) {
          set({ items: updatedItems });
        }
      },
    }),
    {
      name: 'wewala_pos_cart',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        items: state.items,
        billDiscount: state.billDiscount,
        customerPhone: state.customerPhone,
        customerName: state.customerName,
        customerExists: state.customerExists,
        sendSms: state.sendSms,
      }),
    }
  )
);

if (typeof window !== 'undefined') {
  useCartStore.subscribe((state) => {
    const totalCents = state.items.reduce((sum, item) => sum + item.localLineTotalCents, 0);
    broadcastToCustomerDisplay({
      type: 'CART_UPDATE',
      items: state.items.map((i) => ({
        id: i.productId,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        unitPriceCents: i.unitPriceCents,
        lineTotalCents: i.localLineTotalCents,
      })),
      subtotalCents: totalCents,
      totalCents,
    });
  });
}

