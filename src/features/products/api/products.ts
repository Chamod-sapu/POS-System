import { supabase } from '../../../lib/supabase';
import { Database, Json, ProductUnit } from '../../../types/database';
import {
  ProductWithCategory,
  Category,
  StockMovement,
  StockMovementWithStaff,
  LowStockItem,
  ExpiringBatchItem,
} from '../types';

export interface ProductFilters {
  search?: string;
  categoryId?: string;
  lowStockOnly?: boolean;
  outOfStockOnly?: boolean;
  showInactive?: boolean;
  expiringSoonOnly?: boolean;
}

export interface ProductPagination {
  page: number;
  pageSize: number;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
}

/**
 * Fetch server-paginated, filtered, and sorted products
 */
export async function fetchProducts(
  filters: ProductFilters = {},
  pagination: ProductPagination = { page: 1, pageSize: 25 }
): Promise<{ products: ProductWithCategory[]; totalCount: number }> {
  const { page, pageSize, sortColumn = 'name', sortDirection = 'asc' } = pagination;
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;

  let query = supabase
    .from('products')
    .select('*, category:categories(*)', { count: 'exact' });

  // 1. Inactive filter (default to active only unless explicitly requested)
  if (filters.showInactive) {
    query = query.eq('is_active', false);
  } else {
    query = query.eq('is_active', true);
  }

  // 2. Search query (SKU, barcode, or name)
  if (filters.search && filters.search.trim()) {
    const s = filters.search.trim();
    query = query.or(`name.ilike.%${s}%,sku.ilike.%${s}%,barcode.ilike.%${s}%`);
  }

  // 3. Category filter
  if (filters.categoryId) {
    query = query.eq('category_id', filters.categoryId);
  }

  // 4. Out of stock filter
  if (filters.outOfStockOnly) {
    query = query.lte('stock_qty', 0);
  }

  // 5. Low stock filter (stock_qty <= reorder_level)
  // Note: in Supabase/PostgREST, we can filter or compare
  // For precise comparison, we apply lte or handle
  if (filters.lowStockOnly) {
    // Products where stock_qty <= reorder_level
    // We can filter in memory or where stock_qty is low
    query = query.filter('stock_qty', 'lte', 'reorder_level');
  }

  // 6. Sorting & Pagination
  query = query
    .order(sortColumn, { ascending: sortDirection === 'asc' })
    .range(start, end);

  const { data, count, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return {
    products: (data || []) as ProductWithCategory[],
    totalCount: count ?? 0,
  };
}

/**
 * Fetch all active categories
 */
export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

/**
 * Create a new product. If opening stock > 0, records movement through adjust_stock.
 */
export async function createProduct(input: {
  sku: string;
  barcode?: string | null;
  name: string;
  category_id: string;
  unit: string;
  allow_decimal_qty: boolean;
  cost_price_cents: bigint | number;
  selling_price_cents: bigint | number;
  tax_exempt: boolean;
  reorder_level: number;
  track_expiry: boolean;
  opening_stock_qty?: number;
}): Promise<ProductWithCategory> {
  // Check barcode uniqueness before inserting if provided
  if (input.barcode && input.barcode.trim()) {
    const { data: existing } = await supabase
      .from('products')
      .select('id, name, sku')
      .eq('barcode', input.barcode.trim())
      .maybeSingle();

    if (existing) {
      throw new Error(
        `Barcode "${input.barcode}" is already assigned to "${existing.name}" (SKU: ${existing.sku})`
      );
    }
  }

  // 1. Insert product record with stock_qty = 0
  const { data: product, error: insertError } = await supabase
    .from('products')
    .insert({
      sku: input.sku.trim(),
      barcode: input.barcode?.trim() || null,
      name: input.name.trim(),
      category_id: input.category_id,
      unit: input.unit as ProductUnit,
      allow_decimal_qty: input.allow_decimal_qty,
      cost_price_cents: Number(input.cost_price_cents),
      selling_price_cents: Number(input.selling_price_cents),
      tax_exempt: input.tax_exempt,
      stock_qty: 0, // Always starts at 0; opening stock applied via adjust_stock
      reorder_level: input.reorder_level,
      track_expiry: input.track_expiry,
      is_active: true,
    })
    .select('*, category:categories(*)')
    .single();

  if (insertError) {
    if (insertError.code === '23505' && insertError.message.includes('products_sku_key')) {
      throw new Error(`A product with SKU "${input.sku}" already exists.`);
    }
    if (insertError.code === '23505' && insertError.message.includes('products_barcode_key')) {
      throw new Error(`Barcode "${input.barcode}" is already assigned to another product.`);
    }
    throw new Error(insertError.message);
  }

  // 2. If opening stock > 0, record opening stock through adjust_stock
  const openingStock = input.opening_stock_qty ?? 0;
  if (openingStock > 0 && product) {
    const { error: adjustError } = await supabase.rpc('adjust_stock', {
      p_product_id: product.id,
      p_qty_change: openingStock,
      p_reason: 'Opening Stock Initial Entry',
      p_type: 'opening',
    });

    if (adjustError) {
      console.error('Failed to apply opening stock:', adjustError);
      throw new Error(`Product created, but failed to apply opening stock: ${adjustError.message}`);
    }

    product.stock_qty = openingStock;
  }

  return product as ProductWithCategory;
}

/**
 * Update product fields. Excludes stock_qty (stock changes only through adjustments/movements).
 */
export async function updateProduct(
  id: string,
  input: {
    sku: string;
    barcode?: string | null;
    name: string;
    category_id: string;
    unit: string;
    allow_decimal_qty: boolean;
    cost_price_cents: bigint | number;
    selling_price_cents: bigint | number;
    tax_exempt: boolean;
    reorder_level: number;
    track_expiry: boolean;
  }
): Promise<ProductWithCategory> {
  // Check barcode uniqueness
  if (input.barcode && input.barcode.trim()) {
    const { data: existing } = await supabase
      .from('products')
      .select('id, name, sku')
      .eq('barcode', input.barcode.trim())
      .neq('id', id)
      .maybeSingle();

    if (existing) {
      throw new Error(
        `Barcode "${input.barcode}" is already assigned to "${existing.name}" (SKU: ${existing.sku})`
      );
    }
  }

  const { data, error } = await supabase
    .from('products')
    .update({
      sku: input.sku.trim(),
      barcode: input.barcode?.trim() || null,
      name: input.name.trim(),
      category_id: input.category_id,
      unit: input.unit as ProductUnit,
      allow_decimal_qty: input.allow_decimal_qty,
      cost_price_cents: Number(input.cost_price_cents),
      selling_price_cents: Number(input.selling_price_cents),
      tax_exempt: input.tax_exempt,
      reorder_level: input.reorder_level,
      track_expiry: input.track_expiry,
    })
    .eq('id', id)
    .select('*, category:categories(*)')
    .single();

  if (error) {
    if (error.code === '23505' && error.message.includes('products_sku_key')) {
      throw new Error(`A product with SKU "${input.sku}" already exists.`);
    }
    if (error.code === '23505' && error.message.includes('products_barcode_key')) {
      throw new Error(`Barcode "${input.barcode}" is already assigned to another product.`);
    }
    throw new Error(error.message);
  }

  return data as ProductWithCategory;
}

/**
 * Toggle product active status (deactivation instead of delete)
 */
export async function toggleProductActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({ is_active: isActive })
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Fetch immutable stock history movements for a product
 */
export async function fetchStockHistory(productId: string): Promise<StockMovementWithStaff[]> {
  const { data: movements, error } = await supabase
    .from('stock_movements')
    .select('*')
    .eq('product_id', productId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  if (!movements || movements.length === 0) {
    return [];
  }

  const userIds = Array.from(
    new Set(
      movements
        .map((m) => m.created_by)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  );
  let profilesMap = new Map<string, string>();

  if (userIds.length > 0) {
    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      if (profiles) {
        profilesMap = new Map(profiles.map((p) => [p.id, p.full_name]));
      }
    } catch {
      // Graceful fallback if profiles query is restricted
    }
  }

  return movements.map((m) => ({
    ...m,
    staff_name: (m.created_by && profilesMap.get(m.created_by)) || 'System / Staff',
  }));
}

/**
 * Create a new category
 */
export async function createCategory(name: string): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert({ name: name.trim(), is_active: true })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(`Category "${name}" already exists.`);
    }
    throw new Error(error.message);
  }

  return data;
}

/**
 * Update category name or active status
 */
export async function updateCategory(
  id: string,
  name: string,
  isActive: boolean
): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .update({ name: name.trim(), is_active: isActive })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(`Category "${name}" already exists.`);
    }
    throw new Error(error.message);
  }

  return data;
}

/**
 * Fetch low stock products (stock <= reorder_level) and batches expiring within 30 days
 */
export async function fetchLowStockAndExpiring(): Promise<{
  lowStockItems: LowStockItem[];
  expiringBatches: ExpiringBatchItem[];
}> {
  // Low stock products query
  const { data: prods, error: pErr } = await supabase
    .from('products')
    .select('id, sku, name, stock_qty, reorder_level, unit, cost_price_cents, selling_price_cents')
    .eq('is_active', true)
    .filter('stock_qty', 'lte', 'reorder_level');

  if (pErr) throw new Error(pErr.message);

  // Expiring batches in next 30 days query
  const today = new Date();
  const future30Days = new Date();
  future30Days.setDate(today.getDate() + 30);

  const { data: batches, error: bErr } = await supabase
    .from('stock_batches')
    .select('id, product_id, batch_no, qty_remaining, expiry_date, product:products(name, sku)')
    .gt('qty_remaining', 0)
    .lte('expiry_date', future30Days.toISOString().split('T')[0])
    .order('expiry_date', { ascending: true });

  if (bErr) throw new Error(bErr.message);

  type RawBatch = {
    id: string;
    product_id: string;
    batch_no: string;
    qty_remaining: number;
    expiry_date: string;
    product?: { name?: string; sku?: string } | null;
  };

  const expiringBatches: ExpiringBatchItem[] = ((batches || []) as unknown as RawBatch[]).map((b) => {
    const expDate = new Date(b.expiry_date);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return {
      id: b.id,
      product_id: b.product_id,
      product_name: b.product?.name || 'Unknown',
      sku: b.product?.sku || '',
      batch_no: b.batch_no,
      qty_remaining: Number(b.qty_remaining),
      expiry_date: b.expiry_date,
      days_until_expiry: diffDays,
    };
  });

  type RawProduct = Database['public']['Tables']['products']['Row'];

  return {
    lowStockItems: ((prods || []) as unknown as RawProduct[]).map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      stock_qty: Number(p.stock_qty),
      reorder_level: Number(p.reorder_level),
      unit: p.unit,
      cost_price_cents: BigInt(p.cost_price_cents),
      selling_price_cents: BigInt(p.selling_price_cents),
    })),
    expiringBatches,
  };
}

/**
 * Bulk import products in a single database transaction using bulk_import_products RPC
 */
export async function bulkImportProducts(
  productsPayload: Array<{
    sku: string;
    barcode?: string | null;
    name: string;
    category_id: string;
    unit: string;
    allow_decimal_qty: boolean;
    cost_price_cents: number;
    selling_price_cents: number;
    tax_exempt: boolean;
    reorder_level: number;
    track_expiry: boolean;
    opening_stock_qty?: number;
  }>
): Promise<{ success: boolean; imported_count: number }> {
  const { data, error } = await supabase.rpc('bulk_import_products', {
    p_products: productsPayload as unknown as Json,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as { success: boolean; imported_count: number };
}
