import { supabase } from '../../../lib/supabase';
import { Database, PaymentMethod, PurchaseStatus, Json } from '../../../types/database';

export type Purchase = Database['public']['Tables']['purchases']['Row'];
export type PurchaseItem = Database['public']['Tables']['purchase_items']['Row'];

export interface ReceivePurchaseLineItem {
  product_id: string;
  quantity: number;
  unit_cost_cents: number;
  batch_no?: string | null;
  expiry_date?: string | null;
}

export interface ReceivePurchaseParams {
  supplierId: string;
  invoiceNo: string;
  items: ReceivePurchaseLineItem[];
  paidCents?: number;
  payMethod?: PaymentMethod;
}

export interface PurchaseListItem {
  id: string;
  invoice_no: string;
  supplier_id: string;
  supplier_name: string;
  status: PurchaseStatus;
  total_cents: number;
  created_at: string;
  created_by?: string;
}

export interface PurchaseDetailItem {
  id: string;
  purchase_id: string;
  product_id: string;
  quantity: number;
  unit_cost_cents: number;
  total_cost_cents: number;
  batch_no: string | null;
  expiry_date: string | null;
  product_name: string;
  product_sku: string;
  product_unit: string;
  created_at?: string;
}

export interface PurchaseDetail {
  id: string;
  invoice_no: string;
  status: PurchaseStatus;
  total_cents: number;
  created_at: string;
  supplier: {
    id: string;
    name: string;
    contact_person: string | null;
    phone: string | null;
    email: string | null;
  };
  items: PurchaseDetailItem[];
}

/**
 * Atomic goods receiving through database RPC receive_purchase
 */
export async function receivePurchase(params: ReceivePurchaseParams): Promise<{
  purchase_id: string;
  total_cents: number;
  status: string;
}> {
  const { data, error } = await supabase.rpc('receive_purchase', {
    p_supplier_id: params.supplierId,
    p_invoice_no: params.invoiceNo.trim(),
    p_items: params.items as unknown as Json,
    p_paid_cents: params.paidCents ?? 0,
    p_pay_method: params.payMethod ?? 'cash',
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as { purchase_id: string; total_cents: number; status: string };
}

/**
 * Fetch list of purchases with filtering and pagination
 */
export async function fetchPurchases(params?: {
  supplierId?: string;
  status?: PurchaseStatus;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}): Promise<{ purchases: PurchaseListItem[]; count: number }> {
  let query = supabase
    .from('purchases')
    .select('id, invoice_no, supplier_id, status, total_cents, created_at, created_by, suppliers(name)', {
      count: 'exact',
    });

  if (params?.supplierId) {
    query = query.eq('supplier_id', params.supplierId);
  }
  if (params?.status) {
    query = query.eq('status', params.status);
  }
  if (params?.startDate) {
    query = query.gte('created_at', params.startDate);
  }
  if (params?.endDate) {
    query = query.lte('created_at', params.endDate);
  }

  query = query
    .order('created_at', { ascending: false })
    .range(params?.offset ?? 0, (params?.offset ?? 0) + (params?.limit ?? 50) - 1);

  const { data, count, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const purchases: PurchaseListItem[] = (data || []).map((row: any) => ({
    id: row.id,
    invoice_no: row.invoice_no,
    supplier_id: row.supplier_id,
    supplier_name: row.suppliers?.name || 'Unknown Supplier',
    status: row.status,
    total_cents: Number(row.total_cents),
    created_at: row.created_at,
    created_by: row.created_by,
  }));

  return { purchases, count: count || 0 };
}

/**
 * Fetch complete purchase detail for inspection and Goods Received Note (GRN) printing
 */
export async function fetchPurchaseDetail(purchaseId: string): Promise<PurchaseDetail> {
  const { data: purchase, error: pErr } = await supabase
    .from('purchases')
    .select('id, invoice_no, status, total_cents, created_at, suppliers(id, name, contact_person, phone, email)')
    .eq('id', purchaseId)
    .single();

  if (pErr) throw new Error(pErr.message);

  const { data: items, error: iErr } = await supabase
    .from('purchase_items')
    .select('*, products(name, sku, unit)')
    .eq('purchase_id', purchaseId);

  if (iErr) throw new Error(iErr.message);

  const mappedItems: PurchaseDetailItem[] = (items || []).map((item: any) => ({
    id: item.id,
    purchase_id: item.purchase_id,
    product_id: item.product_id,
    quantity: Number(item.quantity),
    unit_cost_cents: Number(item.unit_cost_cents),
    total_cost_cents: Number(item.total_cost_cents),
    batch_no: item.batch_no,
    expiry_date: item.expiry_date,
    product_name: item.products?.name || 'Unknown Product',
    product_sku: item.products?.sku || '',
    product_unit: item.products?.unit || 'pcs',
  }));

  const supplier = (purchase as any).suppliers || {
    id: '',
    name: 'Unknown Supplier',
    contact_person: null,
    phone: null,
    email: null,
  };

  return {
    id: purchase.id,
    invoice_no: purchase.invoice_no || '',
    status: purchase.status,
    total_cents: Number(purchase.total_cents),
    created_at: purchase.created_at,
    supplier,
    items: mappedItems,
  };
}

/**
 * Cancel a purchase (Owner only)
 * Reverses inventory stock and supplier balance
 */
export async function cancelPurchase(purchaseId: string, reason: string): Promise<{ ok: boolean }> {
  const { data, error } = await supabase.rpc('cancel_purchase', {
    p_purchase_id: purchaseId,
    p_reason: reason.trim() || 'Purchase order cancelled by administrator',
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as { ok: boolean };
}
