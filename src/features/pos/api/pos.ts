import { supabase } from '../../../lib/supabase';
import {
  POSProduct,
  CartItem,
  BillDiscount,
  ServerQuote,
  PaymentEntry,
  SaleCheckoutResult,
  HeldCartRow,
  CustomerLookupResult,
} from '../types';
import { Json } from '../../../types/database';

/**
 * Fetch all available catalog products from the pos_products view.
 * Cashiers have read access strictly to pos_products (no cost prices).
 */
export async function fetchPOSProducts(): Promise<POSProduct[]> {
  const { data, error } = await supabase
    .from('pos_products')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as POSProduct[];
}

/**
 * Live search on pos_products view with 150ms debounce
 */
export async function searchPOSProducts(query: string): Promise<POSProduct[]> {
  if (!query || !query.trim()) return [];

  const clean = query.trim();
  const { data, error } = await supabase
    .from('pos_products')
    .select('*')
    .eq('is_active', true)
    .or(`barcode.eq.${clean},sku.ilike.%${clean}%,name.ilike.%${clean}%`)
    .limit(20);

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as POSProduct[];
}

/**
 * Fast customer lookup by phone number
 */
export async function lookupCustomerByPhone(phone: string): Promise<CustomerLookupResult> {
  const clean = phone.trim().replace(/[\s-]/g, '');
  if (!clean || clean.length < 9) {
    return { exists: false };
  }

  // Search by exact match or normalized suffix match
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, sms_opt_out, points_balance')
    .or(`phone.eq.${clean},phone.ilike.%${clean.slice(-9)}%`)
    .maybeSingle();

  if (error || !data) {
    return { exists: false };
  }

  return {
    exists: true,
    id: data.id,
    name: data.name,
    phone: data.phone,
    smsOptOut: data.sms_opt_out,
    pointsBalance: Number(data.points_balance || 0),
  };
}

/**
 * Server-side authoritative preview calculation via quote_sale RPC.
 * Runs the exact same maths and limits as checkout without writing to the database.
 */
export async function quoteSale(
  items: CartItem[],
  billDiscount: BillDiscount
): Promise<ServerQuote> {
  if (items.length === 0) {
    return {
      lines: [],
      subtotal_cents: 0,
      line_discount_cents: 0,
      bill_discount_cents: 0,
      tax: { rate_percent: 0, mode: 'exclusive', taxable_cents: 0, tax_cents: 0 },
      total_cents: 0,
      warnings: [],
    };
  }

  const p_items = items.map((i) => ({
    product_id: i.productId,
    quantity: i.quantity,
    discount_type: i.discountType,
    discount_value: i.discountValue,
  }));

  const p_bill_discount = {
    type: billDiscount.type,
    value: billDiscount.value,
  };

  const { data, error } = await supabase.rpc('quote_sale', {
    p_items: p_items as unknown as Json,
    p_bill_discount: p_bill_discount as unknown as Json,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as ServerQuote;
}

export interface CreateSaleInput {
  idempotencyKey: string;
  items: CartItem[];
  billDiscount: BillDiscount;
  payments: PaymentEntry[];
  customerPhone?: string | null;
  customerName?: string | null;
}

/**
 * Finalize sale through the authoritative create_sale RPC.
 * Implements strict retry logic with the SAME idempotency key on network timeouts.
 */
export async function createSale(input: CreateSaleInput): Promise<SaleCheckoutResult> {
  const p_items = input.items.map((i) => ({
    product_id: i.productId,
    quantity: i.quantity,
    discount_type: i.discountType,
    discount_value: i.discountValue,
  }));

  const p_bill_discount = {
    type: input.billDiscount.type,
    value: input.billDiscount.value,
  };

  const p_payments = input.payments.map((p) => ({
    method: p.method,
    amount_cents: p.amountCents,
    reference: p.reference?.trim() || null,
  }));

  // Attempt RPC call with 1 timeout-retry using the exact same idempotency key
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { data, error } = await supabase.rpc('create_sale', {
        p_idempotency_key: input.idempotencyKey,
        p_items: p_items as unknown as Json,
        p_bill_discount: p_bill_discount as unknown as Json,
        p_payments: p_payments as unknown as Json,
        p_customer_phone: input.customerPhone?.trim() || null,
        p_customer_name: input.customerName?.trim() || null,
      });

      if (error) {
        throw new Error(error.message);
      }

      return data as unknown as SaleCheckoutResult;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const errMsg = lastError.message.toLowerCase();

      // If network timeout or offline error, check if the sale was actually recorded
      if (
        attempt === 1 &&
        (errMsg.includes('timeout') ||
          errMsg.includes('network') ||
          errMsg.includes('failed to fetch'))
      ) {
        try {
          const { data: existingSale } = await supabase
            .from('sales')
            .select('id')
            .eq('idempotency_key', input.idempotencyKey)
            .maybeSingle();

          if (existingSale?.id) {
            const { data: bill } = await supabase.rpc('get_bill', {
              p_sale_id: existingSale.id,
            });
            if (bill) {
              return bill as unknown as SaleCheckoutResult;
            }
          }
        } catch {
          // Fall through to retry attempt 2
        }
        continue;
      }
      break;
    }
  }

  throw lastError || new Error('Sale transaction failed');
}

/**
 * Fetch all held carts for the current cashier
 */
export async function fetchHeldCarts(): Promise<HeldCartRow[]> {
  const { data, error } = await supabase
    .from('held_carts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as unknown as HeldCartRow[];
}

/**
 * Park current cart into held_carts
 */
export async function holdCurrentCart(
  label: string,
  cartJson: HeldCartRow['cart_json']
): Promise<HeldCartRow> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('Not logged in');

  const { data, error } = await supabase
    .from('held_carts')
    .insert({
      cashier_id: user.id,
      label: label.trim() || 'Held Cart',
      cart_json: cartJson as unknown as Json,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as HeldCartRow;
}

/**
 * Delete a held cart after recall or discard
 */
export async function deleteHeldCart(id: string): Promise<void> {
  const { error } = await supabase.from('held_carts').delete().eq('id', id);
  if (error) {
    throw new Error(error.message);
  }
}

