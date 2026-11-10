import { supabase } from '../../../lib/supabase';
import { Database, PaymentMethod } from '../../../types/database';
import { formatLKR } from '../../../lib/money';

export type Supplier = Database['public']['Tables']['suppliers']['Row'];
export type SupplierInsert = Database['public']['Tables']['suppliers']['Insert'];
export type SupplierUpdate = Database['public']['Tables']['suppliers']['Update'];
export type SupplierPayment = Database['public']['Tables']['supplier_payments']['Row'];

export interface SupplierStatementEntry {
  id: string;
  date: string;
  type: 'purchase' | 'payment';
  reference: string;
  description: string;
  debitCents: bigint;
  creditCents: bigint;
  balanceCents: bigint;
  method?: string;
}

/**
 * Fetch all suppliers ordered by name
 */
export async function fetchSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

/**
 * Create a new supplier
 */
export async function createSupplier(payload: {
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  payment_terms_days?: number;
}): Promise<Supplier> {
  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      name: payload.name.trim(),
      contact_person: payload.contact_person?.trim() || null,
      phone: payload.phone?.trim() || null,
      email: payload.email?.trim() || null,
      payment_terms_days: payload.payment_terms_days ?? 30,
      balance_cents: 0,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Update supplier details
 */
export async function updateSupplier(
  id: string,
  payload: Partial<{
    name: string;
    contact_person: string | null;
    phone: string | null;
    email: string | null;
    payment_terms_days: number;
    is_active: boolean;
  }>
): Promise<Supplier> {
  const { data, error } = await supabase
    .from('suppliers')
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Delete a supplier (Owner only)
 */
export async function deleteSupplier(id: string): Promise<void> {
  const { error } = await supabase.from('suppliers').delete().eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Record a payment against an outstanding supplier balance
 * Calls database RPC function record_supplier_payment
 */
export async function recordSupplierPayment(payload: {
  supplierId: string;
  amountCents: number;
  method: PaymentMethod;
  reference?: string | null;
}): Promise<{ ok: boolean; new_balance_cents: number }> {
  const { data, error } = await supabase.rpc('record_supplier_payment', {
    p_supplier_id: payload.supplierId,
    p_amount_cents: payload.amountCents,
    p_method: payload.method,
    p_reference: payload.reference || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as { ok: boolean; new_balance_cents: number };
}

/**
 * Fetch chronological statement of account for a supplier
 * Combines purchases and payments in chronological order and calculates running balance
 */
export async function fetchSupplierStatement(supplierId: string): Promise<SupplierStatementEntry[]> {
  // Fetch non-cancelled purchases
  const { data: purchases, error: pErr } = await supabase
    .from('purchases')
    .select('id, invoice_no, total_cents, created_at, status')
    .eq('supplier_id', supplierId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true });

  if (pErr) throw new Error(pErr.message);

  // Fetch payments
  const { data: payments, error: payErr } = await supabase
    .from('supplier_payments')
    .select('id, amount_cents, method, reference, paid_at')
    .eq('supplier_id', supplierId)
    .order('paid_at', { ascending: true });

  if (payErr) throw new Error(payErr.message);

  // Merge and sort ascending by date
  type RawEntry =
    | {
        kind: 'purchase';
        id: string;
        date: string;
        reference: string;
        totalCents: bigint;
      }
    | {
        kind: 'payment';
        id: string;
        date: string;
        reference: string;
        amountCents: bigint;
        method: string;
      };

  const rawEntries: RawEntry[] = [
    ...(purchases || []).map((p) => ({
      kind: 'purchase' as const,
      id: p.id,
      date: p.created_at,
      reference: p.invoice_no || 'Invoice',
      totalCents: BigInt(p.total_cents),
    })),
    ...(payments || []).map((pay) => ({
      kind: 'payment' as const,
      id: pay.id,
      date: pay.paid_at,
      reference: pay.reference || 'Payment',
      amountCents: BigInt(pay.amount_cents),
      method: pay.method,
    })),
  ];

  rawEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let runningBalance = 0n;
  const statement: SupplierStatementEntry[] = [];

  for (const item of rawEntries) {
    if (item.kind === 'purchase') {
      runningBalance += item.totalCents;
      statement.push({
        id: item.id,
        date: item.date,
        type: 'purchase',
        reference: item.reference,
        description: `Goods Received (Invoice #${item.reference})`,
        debitCents: item.totalCents,
        creditCents: 0n,
        balanceCents: runningBalance,
      });
    } else {
      runningBalance -= item.amountCents;
      statement.push({
        id: item.id,
        date: item.date,
        type: 'payment',
        reference: item.reference,
        description: `Payment via ${item.method.replace('_', ' ')}`,
        debitCents: 0n,
        creditCents: item.amountCents,
        balanceCents: runningBalance,
        method: item.method,
      });
    }
  }

  return statement;
}

/**
 * Generate CSV string from statement entries
 */
export function generateStatementCSV(
  supplierName: string,
  entries: SupplierStatementEntry[]
): string {
  const headers = ['Date', 'Type', 'Reference', 'Description', 'Debit (Rs)', 'Credit (Rs)', 'Balance (Rs)'];
  const rows = entries.map((e) => [
    new Date(e.date).toLocaleString('en-LK', { timeZone: 'Asia/Colombo' }),
    e.type.toUpperCase(),
    `"${e.reference.replace(/"/g, '""')}"`,
    `"${e.description.replace(/"/g, '""')}"`,
    (Number(e.debitCents) / 100).toFixed(2),
    (Number(e.creditCents) / 100).toFixed(2),
    (Number(e.balanceCents) / 100).toFixed(2),
  ]);

  return [
    `"Supplier Statement: ${supplierName.replace(/"/g, '""')}"`,
    headers.join(','),
    ...rows.map((r) => r.join(',')),
  ].join('\n');
}

/**
 * Download statement as CSV file
 */
export function downloadStatementCSV(supplierName: string, entries: SupplierStatementEntry[]): void {
  const csv = generateStatementCSV(supplierName, entries);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = supplierName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `supplier-statement-${safeName}-${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
