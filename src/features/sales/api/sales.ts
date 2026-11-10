import { supabase } from '../../../lib/supabase';
import { Bill } from '../../receipts/types';

export interface SalesFilterParams {
  search?: string;
  startDate?: string;
  endDate?: string;
  cashierId?: string;
  status?: string;
  role: 'owner' | 'manager' | 'cashier';
  userId?: string;
  page?: number;
  pageSize?: number;
}

export interface SaleSummaryRow {
  id: string;
  bill_no: string;
  cashier_id: string;
  customer_phone: string | null;
  status: 'completed' | 'voided' | 'partially_returned' | 'returned';
  total_cents: number;
  subtotal_cents: number;
  print_count: number;
  created_at: string;
}

/**
 * Queries the sales ledger respecting strict RLS and role business constraints:
 * Cashiers are strictly restricted to their own transactions from the last 24 hours.
 * Managers and Owners can query all transactions across the store lifetime.
 */
export async function fetchSales(
  params: SalesFilterParams
): Promise<{ sales: SaleSummaryRow[]; totalCount: number }> {
  const {
    search,
    startDate,
    endDate,
    cashierId,
    status,
    role,
    userId,
    page = 1,
    pageSize = 25,
  } = params;

  let query = supabase
    .from('sales')
    .select(
      'id, bill_no, cashier_id, customer_phone, status, total_cents, subtotal_cents, print_count, created_at',
      { count: 'exact' }
    );

  // Role Constraint: Cashiers only see own sales within the last 24 hours
  if (role === 'cashier') {
    if (userId) {
      query = query.eq('cashier_id', userId);
    }
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    query = query.gte('created_at', twentyFourHoursAgo);
  } else if (cashierId) {
    query = query.eq('cashier_id', cashierId);
  }

  // Search filter (Bill number or customer phone)
  if (search && search.trim().length > 0) {
    const term = search.trim();
    if (term.startsWith('WWL-')) {
      query = query.ilike('bill_no', `%${term}%`);
    } else {
      query = query.or(`bill_no.ilike.%${term}%,customer_phone.ilike.%${term}%`);
    }
  }

  // Date range filters
  if (startDate) {
    query = query.gte('created_at', startDate);
  }
  if (endDate) {
    query = query.lte('created_at', endDate);
  }

  // Status filter
  if (status && status !== 'all') {
    query = query.eq('status', status as 'completed' | 'voided' | 'partially_returned' | 'returned');
  }

  // Order and Pagination
  query = query.order('created_at', { ascending: false });
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    console.error('Error fetching sales ledger:', error);
    throw new Error(error.message);
  }

  const rows: SaleSummaryRow[] = (data || []).map((row) => ({
    id: row.id,
    bill_no: row.bill_no,
    cashier_id: row.cashier_id,
    customer_phone: row.customer_phone,
    status: row.status,
    total_cents: Number(row.total_cents),
    subtotal_cents: Number(row.subtotal_cents),
    print_count: Number(row.print_count),
    created_at: row.created_at,
  }));

  return {
    sales: rows,
    totalCount: count || 0,
  };
}

/**
 * Fetches the complete immutable Bill JSON structure via the Postgres get_bill function.
 */
export async function fetchBill(saleId: string): Promise<Bill> {
  const { data, error } = await supabase.rpc('get_bill', {
    p_sale_id: saleId,
  });

  if (error) {
    console.error('Failed to retrieve bill via RPC:', error);
    throw new Error(error.message);
  }

  return data as unknown as Bill;
}

/**
 * Records that a bill has been printed or reprinted via mark_bill_printed.
 * Increments print_count and creates a tamper-evident audit_log entry.
 */
export async function recordBillPrinted(
  saleId: string
): Promise<{ success: boolean; print_count: number; is_duplicate: boolean }> {
  const { data, error } = await supabase.rpc('mark_bill_printed', {
    p_sale_id: saleId,
  });

  if (error) {
    console.error('Failed to mark bill printed:', error);
    throw new Error(error.message);
  }

  return data as { success: boolean; print_count: number; is_duplicate: boolean };
}
