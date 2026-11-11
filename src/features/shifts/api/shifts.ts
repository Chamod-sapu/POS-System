import { supabase } from '../../../lib/supabase';
import { Database } from '../../../types/database';

export type Shift = Database['public']['Tables']['shifts']['Row'];
export type CashMovement = Database['public']['Tables']['cash_movements']['Row'];

export interface ShiftWithCashier extends Shift {
  profiles?: {
    full_name: string | null;
  } | null;
}

export interface XReportData {
  report_type: 'X_REPORT';
  shift_id: string;
  cashier_id: string;
  cashier_name: string;
  terminal_name: string;
  opened_at: string;
  as_of: string;
  opening_float_cents: number;
  cash_sales_cents: number;
  change_given_cents: number;
  net_cash_sales_cents: number;
  non_cash_sales_cents: number;
  gross_sales_cents: number;
  cash_refunds_cents: number;
  non_cash_refunds_cents: number;
  cash_in_cents: number;
  cash_out_cents: number;
  expected_cash_cents: number;
  sales_count: number;
}

export interface ZReportData {
  report_type: 'Z_REPORT';
  shift_id: string;
  cashier_id: string;
  cashier_name: string;
  terminal_name: string;
  opened_at: string;
  closed_at: string;
  opening_float_cents: number;
  cash_sales_cents: number;
  change_given_cents: number;
  net_cash_sales_cents: number;
  cash_refunds_cents: number;
  cash_in_cents: number;
  cash_out_cents: number;
  expected_cash_cents: number;
  counted_cash_cents: number;
  difference_cents: number;
  note?: string | null;
}

/**
 * Fetches the currently open shift for a given cashier.
 */
export async function fetchCurrentOpenShift(cashierId: string): Promise<Shift | null> {
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('cashier_id', cashierId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch open shift:', error);
    return null;
  }

  return data;
}

/**
 * Opens a new shift for the authenticated cashier with an opening float.
 */
export async function openShift(
  openingFloatCents: number,
  terminalName?: string
): Promise<Shift> {
  const { data, error } = await supabase.rpc('open_shift', {
    p_opening_float_cents: openingFloatCents,
    p_terminal_name: terminalName || 'Main Terminal',
  });

  if (error) {
    console.error('Failed to open shift:', error);
    throw new Error(error.message);
  }

  return data as unknown as Shift;
}

/**
 * Closes an open shift with drawer reconciliation and counted cash.
 */
export async function closeShift(
  countedCashCents: number,
  note?: string,
  shiftId?: string
): Promise<ZReportData> {
  const { data, error } = await supabase.rpc('close_shift', {
    p_counted_cash_cents: countedCashCents,
    p_note: note || null,
    p_shift_id: shiftId || null,
  });

  if (error) {
    console.error('Failed to close shift:', error);
    throw new Error(error.message);
  }

  const raw = (data || {}) as Record<string, any>;
  const cashSales = Number(raw.cash_sales_cents || 0);
  const changeGiven = Number(raw.change_given_cents || 0);

  return {
    report_type: 'Z_REPORT',
    shift_id: raw.id || raw.shift_id || '',
    cashier_id: raw.cashier_id || '',
    cashier_name: raw.cashier_name || 'Staff Member',
    terminal_name: raw.terminal_name || 'Main Terminal',
    opened_at: raw.opened_at || new Date().toISOString(),
    closed_at: raw.closed_at || new Date().toISOString(),
    opening_float_cents: Number(raw.opening_float_cents || 0),
    cash_sales_cents: cashSales,
    change_given_cents: changeGiven,
    net_cash_sales_cents: Number(raw.net_cash_sales_cents ?? (cashSales - changeGiven)),
    cash_refunds_cents: Number(raw.cash_refunds_cents || 0),
    cash_in_cents: Number(raw.cash_in_cents || 0),
    cash_out_cents: Number(raw.cash_out_cents || 0),
    expected_cash_cents: Number(raw.expected_cash_cents || 0),
    counted_cash_cents: Number(raw.counted_cash_cents || 0),
    difference_cents: Number(raw.difference_cents || 0),
    note: raw.note || null,
  };
}

/**
 * Generates a mid-shift X-Report without closing the shift.
 */
export async function fetchXReport(shiftId?: string): Promise<XReportData> {
  const { data, error } = await supabase.rpc('x_report', {
    p_shift_id: shiftId || null,
  });

  if (error) {
    console.error('Failed to generate X-report:', error);
    throw new Error(error.message);
  }

  const raw = (data || {}) as Record<string, any>;
  const cardSales = Number(raw.card_sales_cents || 0);
  const transferSales = Number(raw.transfer_sales_cents || 0);
  const creditSales = Number(raw.credit_sales_cents || 0);
  const nonCashSales = cardSales + transferSales + creditSales;
  const cashSales = Number(raw.cash_sales_cents || 0);
  const changeGiven = Number(raw.change_given_cents || 0);

  return {
    report_type: 'X_REPORT',
    shift_id: raw.shift_id || shiftId || '',
    cashier_id: raw.cashier_id || '',
    cashier_name: raw.cashier_name || 'Cashier',
    terminal_name: raw.terminal_name || 'Main Terminal',
    opened_at: raw.opened_at || new Date().toISOString(),
    as_of: raw.as_of || raw.generated_at || new Date().toISOString(),
    opening_float_cents: Number(raw.opening_float_cents || 0),
    cash_sales_cents: cashSales,
    change_given_cents: changeGiven,
    net_cash_sales_cents: Number(raw.net_cash_sales_cents ?? (cashSales - changeGiven)),
    non_cash_sales_cents: Number(raw.non_cash_sales_cents ?? nonCashSales),
    gross_sales_cents: Number(raw.gross_sales_cents ?? (cashSales + nonCashSales)),
    cash_refunds_cents: Number(raw.cash_refunds_cents || 0),
    non_cash_refunds_cents: Number(raw.non_cash_refunds_cents || 0),
    cash_in_cents: Number(raw.cash_in_cents || 0),
    cash_out_cents: Number(raw.cash_out_cents || 0),
    expected_cash_cents: Number(raw.expected_cash_cents || 0),
    sales_count: Number(raw.sales_count || 0),
  };
}

/**
 * Records a cash movement (cash in or cash out / drop / expense).
 */
export async function recordCashMovement(
  shiftId: string,
  kind: 'cash_in' | 'cash_out',
  amountCents: number,
  reason: string
): Promise<CashMovement> {
  const { data, error } = await supabase.rpc('record_cash_movement', {
    p_shift_id: shiftId,
    p_kind: kind,
    p_amount_cents: amountCents,
    p_reason: reason,
  });

  if (error) {
    console.error('Failed to record cash movement:', error);
    throw new Error(error.message);
  }

  return data as unknown as CashMovement;
}

/**
 * Fetches shift history with cashier details for the Shifts ledger.
 */
export async function fetchShifts(): Promise<ShiftWithCashier[]> {
  const { data, error } = await supabase
    .from('shifts')
    .select(`
      *,
      profiles:cashier_id (
        full_name
      )
    `)
    .order('opened_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Failed to fetch shifts ledger:', error);
    throw new Error(error.message);
  }

  return (data || []) as ShiftWithCashier[];
}

/**
 * Fetches cash movements for a specific shift.
 */
export async function fetchShiftMovements(shiftId: string): Promise<CashMovement[]> {
  const { data, error } = await supabase
    .from('cash_movements')
    .select('*')
    .eq('shift_id', shiftId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch shift movements:', error);
    return [];
  }

  return data || [];
}
