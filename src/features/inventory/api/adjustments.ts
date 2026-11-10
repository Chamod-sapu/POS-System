import { supabase } from '../../../lib/supabase';
import { Database, Json } from '../../../types/database';

export type MovementType = Database['public']['Enums']['movement_type'];

export interface AdjustStockInput {
  productId: string;
  qtyChange: number;
  reason: string;
  type?: MovementType;
}

export interface StocktakeAdjustmentItem {
  product_id: string;
  counted_qty: number;
  note?: string;
}

/**
 * Perform single-product stock adjustment via adjust_stock RPC
 */
export async function adjustStock({
  productId,
  qtyChange,
  reason,
  type = 'adjustment',
}: AdjustStockInput): Promise<{
  product_id: string;
  sku: string;
  name: string;
  old_stock_qty: number;
  new_stock_qty: number;
}> {
  if (qtyChange === 0) {
    throw new Error('Quantity change cannot be zero.');
  }

  const { data, error } = await supabase.rpc('adjust_stock', {
    p_product_id: productId,
    p_qty_change: qtyChange,
    p_reason: reason.trim(),
    p_type: type,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as {
    product_id: string;
    sku: string;
    name: string;
    old_stock_qty: number;
    new_stock_qty: number;
  };
}

/**
 * Execute atomic bulk stocktake reconciliation via bulk_stocktake RPC
 */
export async function executeStocktake(
  adjustments: StocktakeAdjustmentItem[]
): Promise<{ success: boolean; adjusted_items_count: number }> {
  const { data, error } = await supabase.rpc('bulk_stocktake', {
    p_adjustments: adjustments as unknown as Json,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as { success: boolean; adjusted_items_count: number };
}

export interface AdjustSearchProduct {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  unit: string;
  allow_decimal_qty: boolean;
  stock_qty: number;
  selling_price_cents: number;
}

/**
 * Quick search for products by barcode, SKU, or name
 */
export async function searchProducts(queryText: string): Promise<AdjustSearchProduct[]> {
  if (!queryText.trim()) return [];

  const clean = queryText.trim();
  const { data, error } = await supabase
    .from('products')
    .select('id, sku, barcode, name, unit, allow_decimal_qty, stock_qty, selling_price_cents')
    .eq('is_active', true)
    .or(`barcode.eq.${clean},sku.ilike.%${clean}%,name.ilike.%${clean}%`)
    .limit(10);

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}
