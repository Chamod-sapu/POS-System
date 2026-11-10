import { supabase } from '../../../lib/supabase';
import { Database } from '../../../types/database';

export type Customer = Database['public']['Tables']['customers']['Row'];
export type CustomerInsert = Database['public']['Tables']['customers']['Insert'];
export type CustomerUpdate = Database['public']['Tables']['customers']['Update'];
export type PointsLedgerEntry = Database['public']['Tables']['customer_points_ledger']['Row'];

export interface CustomerSaleSummary {
  id: string;
  bill_no: string;
  created_at: string;
  total_cents: number;
  status: string;
}

export interface CustomerDetail {
  customer: Customer;
  sales: CustomerSaleSummary[];
  pointsLedger: PointsLedgerEntry[];
  totalSpentCents: bigint;
  billCount: number;
  lastVisit: string | null;
}

/**
 * Normalizes Sri Lankan phone numbers to E.164 +94XXXXXXXXX format
 * Accepts:
 * - 0771234567 -> +94771234567
 * - 771234567  -> +94771234567
 * - +94771234567 -> +94771234567
 * Throws an Error if invalid.
 */
export function normalizeSriLankanPhone(phone: string): string {
  if (!phone || !phone.trim()) {
    throw new Error('Phone number is required');
  }

  const cleaned = phone.trim().replace(/[\s-]/g, '');

  let normalized: string;
  if (cleaned.startsWith('+94')) {
    normalized = cleaned;
  } else if (cleaned.startsWith('0')) {
    normalized = '+94' + cleaned.slice(1);
  } else if (cleaned.length === 9 && !cleaned.startsWith('+')) {
    normalized = '+94' + cleaned;
  } else if (cleaned.startsWith('94') && cleaned.length === 11) {
    normalized = '+' + cleaned;
  } else {
    normalized = cleaned;
  }

  if (!/^\+94\d{9}$/.test(normalized)) {
    throw new Error(
      'Invalid Sri Lankan phone number. Expected 9 digits after +94 (e.g. 0771234567 or +94771234567)'
    );
  }

  return normalized;
}

/**
 * Fetch customers with optional name/phone search
 */
export async function fetchCustomers(search?: string): Promise<Customer[]> {
  let query = supabase.from('customers').select('*');

  if (search && search.trim()) {
    const term = search.trim();
    query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
  }

  query = query.order('created_at', { ascending: false }).limit(100);

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

/**
 * Fetch full customer profile, transaction history, and loyalty ledger
 */
export async function fetchCustomerDetail(customerId: string): Promise<CustomerDetail> {
  const { data: customer, error: cErr } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .single();

  if (cErr) throw new Error(cErr.message);

  // Fetch customer sales
  const { data: sales, error: sErr } = await supabase
    .from('sales')
    .select('id, bill_no, created_at, total_cents, status')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (sErr) throw new Error(sErr.message);

  // Fetch loyalty points ledger
  const { data: points, error: pErr } = await supabase
    .from('customer_points_ledger')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (pErr) throw new Error(pErr.message);

  const mappedSales: CustomerSaleSummary[] = (sales || []).map((s) => ({
    id: s.id,
    bill_no: s.bill_no,
    created_at: s.created_at,
    total_cents: Number(s.total_cents),
    status: s.status,
  }));

  const completedSales = mappedSales.filter((s) => s.status !== 'voided');
  const totalSpentCents = completedSales.reduce(
    (acc, s) => acc + BigInt(s.total_cents),
    0n
  );
  const lastVisit = completedSales.length > 0 && completedSales[0]?.created_at ? completedSales[0].created_at : null;

  return {
    customer,
    sales: mappedSales,
    pointsLedger: points || [],
    totalSpentCents,
    billCount: completedSales.length,
    lastVisit,
  };
}

/**
 * Create a new customer
 */
export async function createCustomer(payload: {
  name: string;
  phone: string;
  email?: string | null;
  smsOptOut?: boolean;
}): Promise<Customer> {
  const normalizedPhone = normalizeSriLankanPhone(payload.phone);

  const { data, error } = await supabase
    .from('customers')
    .insert({
      name: payload.name.trim(),
      phone: normalizedPhone,
      email: payload.email?.trim() || null,
      sms_opt_out: payload.smsOptOut ?? false,
      credit_balance_cents: 0,
      points_balance: 0,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(`A customer with phone number ${normalizedPhone} already exists.`);
    }
    throw new Error(error.message);
  }

  return data;
}

/**
 * Update an existing customer
 */
export async function updateCustomer(
  id: string,
  payload: Partial<{
    name: string;
    phone: string;
    email: string | null;
    sms_opt_out: boolean;
  }>
): Promise<Customer> {
  const updates: CustomerUpdate = {};

  if (payload.name !== undefined) updates.name = payload.name.trim();
  if (payload.phone !== undefined) updates.phone = normalizeSriLankanPhone(payload.phone);
  if (payload.email !== undefined) updates.email = payload.email?.trim() || null;
  if (payload.sms_opt_out !== undefined) updates.sms_opt_out = payload.sms_opt_out;

  const { data, error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('A customer with this phone number already exists.');
    }
    throw new Error(error.message);
  }

  return data;
}

/**
 * Delete customer (Owner only)
 */
export async function deleteCustomer(id: string): Promise<void> {
  const { error } = await supabase.from('customers').delete().eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}
