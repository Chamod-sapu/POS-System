import { supabase } from '../../../lib/supabase';
import { Json } from '../../../types/database';

export interface ReturnItemInput {
  sale_item_id: string;
  quantity: number;
}

export interface ReturnLineSnapshot {
  sale_item_id: string;
  product_name: string;
  sku: string;
  unit: string;
  returned_quantity: number;
  refund_cents: number;
}

export interface ReturnDetailSnapshot {
  return_id: string;
  return_number: string;
  created_at: string;
  bill_no: string;
  sale_id: string;
  cashier: {
    id: string;
    name: string;
  };
  shop: {
    name: string;
    address: string;
    phone: string;
    vat_reg_no?: string | null;
    footer?: string | null;
  };
  customer?: {
    id: string;
    name?: string | null;
    phone: string;
  } | null;
  reason: string;
  refund_method: 'cash' | 'store_credit';
  restock: boolean;
  lines: ReturnLineSnapshot[];
  total_refund_cents: number;
}

export interface VoidSaleResult {
  success: boolean;
  sale_id: string;
  voided_at: string;
  reason: string;
  stock_restored: boolean;
  batches_restored: number;
}

/**
 * Voids a completed sale transaction (Manager or Owner only).
 * Restores exact stock and batches via sale_item_batches.
 */
export async function voidSale(saleId: string, reason: string): Promise<VoidSaleResult> {
  const { data, error } = await supabase.rpc('void_sale', {
    p_sale_id: saleId,
    p_reason: reason,
  });

  if (error) {
    console.error('Failed to void sale:', error);
    throw new Error(error.message);
  }

  return data as unknown as VoidSaleResult;
}

/**
 * Creates a return / credit note for selected items (Manager or Owner only).
 * Performs cent-perfect refund calculation and optional restock to original batches.
 */
export async function createReturn(
  saleId: string,
  items: ReturnItemInput[],
  reason: string,
  refundMethod: 'cash' | 'store_credit',
  restock: boolean
): Promise<ReturnDetailSnapshot> {
  const { data, error } = await supabase.rpc('create_return', {
    p_sale_id: saleId,
    p_items: items as unknown as Json,
    p_reason: reason,
    p_refund_method: refundMethod,
    p_restock: restock,
  });

  if (error) {
    console.error('Failed to create return:', error);
    throw new Error(error.message);
  }

  const returnId = (data as { return_id: string }).return_id;
  return await fetchReturn(returnId);
}

/**
 * Fetches the complete snapshot of a return note for viewing or thermal printing.
 */
export async function fetchReturn(returnId: string): Promise<ReturnDetailSnapshot> {
  const { data, error } = await supabase.rpc('get_return', {
    p_return_id: returnId,
  });

  if (error) {
    console.error('Failed to fetch return snapshot:', error);
    throw new Error(error.message);
  }

  return data as unknown as ReturnDetailSnapshot;
}

/**
 * Fetches existing returns created for a given sale.
 */
export async function fetchReturnsForSale(saleId: string): Promise<ReturnDetailSnapshot[]> {
  const { data, error } = await supabase
    .from('sale_returns')
    .select('id')
    .eq('sale_id', saleId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch returns for sale:', error);
    return [];
  }

  const returnDetails = await Promise.all(
    (data || []).map((row) => fetchReturn(row.id))
  );

  return returnDetails;
}
