import { Bill, BillVerificationResult } from '../types';
import { roundHalfUp, parseQuantityToThousandths } from '../../../lib/money';
import { supabase } from '../../../lib/supabase';

/**
 * Independently re-adds every line item, discount, tax, payment and change amount
 * and strictly verifies that everything balances to 0 difference down to the exact cent.
 *
 * If ANY field differs by even 1 cent:
 * Returns { valid: false, error: 'Bill totals mismatch, do not hand to customer', diffCents }
 */
export function verifyBill(bill: Bill): BillVerificationResult {
  if (!bill) {
    return { valid: false, error: 'Bill object is missing' };
  }

  if (!bill.lines || bill.lines.length === 0) {
    return { valid: false, error: 'Bill has no line items' };
  }

  let calculatedSubtotal = 0n;
  let calculatedLineDiscounts = 0n;
  let calculatedLinesTotal = 0n;

  for (const line of bill.lines) {
    // 1. Gross per line: round_half_up(quantity * unit_price_cents)
    const qtyThousandths = parseQuantityToThousandths(line.quantity);
    const unitPrice = BigInt(line.unit_price_cents);
    const lineGross = roundHalfUp(qtyThousandths * unitPrice, 1000n);

    calculatedSubtotal += lineGross;
    calculatedLineDiscounts += BigInt(line.line_discount_cents);
    calculatedLinesTotal += BigInt(line.line_total_cents);
  }

  const billSubtotal = BigInt(bill.subtotal_cents);
  const billLineDiscount = BigInt(bill.line_discount_cents);
  const billBillDiscount = BigInt(bill.bill_discount_cents);
  const billTaxCents = BigInt(bill.tax?.tax_cents ?? 0);
  const billTaxableCents = BigInt(bill.tax?.taxable_cents ?? 0);
  const billTotal = BigInt(bill.total_cents);
  const billPaid = BigInt(bill.paid_cents);
  const billChange = BigInt(bill.change_cents);

  // Check 1: Subtotal verification
  if (calculatedSubtotal !== billSubtotal) {
    const diff = Number(calculatedSubtotal - billSubtotal);
    return {
      valid: false,
      error: `Bill totals mismatch, do not hand to customer: Subtotal mismatch (calculated ${calculatedSubtotal} vs stored ${billSubtotal})`,
      diffCents: diff,
    };
  }

  // Check 2: Line discounts sum verification
  if (calculatedLineDiscounts !== billLineDiscount) {
    const diff = Number(calculatedLineDiscounts - billLineDiscount);
    return {
      valid: false,
      error: `Bill totals mismatch, do not hand to customer: Line discounts mismatch (calculated ${calculatedLineDiscounts} vs stored ${billLineDiscount})`,
      diffCents: diff,
    };
  }

  // Check 3: Line totals sum verification against grand total
  if (calculatedLinesTotal !== billTotal) {
    const diff = Number(calculatedLinesTotal - billTotal);
    return {
      valid: false,
      error: `Bill totals mismatch, do not hand to customer: Line totals sum mismatch (sum ${calculatedLinesTotal} vs total ${billTotal})`,
      diffCents: diff,
    };
  }

  // Check 4: Tax and Grand Total equation
  let expectedTotal: bigint;
  if (bill.tax?.mode === 'exclusive') {
    expectedTotal = billSubtotal - billLineDiscount - billBillDiscount + billTaxCents;
  } else {
    // inclusive mode: total = subtotal - line_discount - bill_discount
    expectedTotal = billSubtotal - billLineDiscount - billBillDiscount;
  }

  if (expectedTotal !== billTotal) {
    const diff = Number(expectedTotal - billTotal);
    return {
      valid: false,
      error: `Bill totals mismatch, do not hand to customer: Total calculation mismatch (expected ${expectedTotal} vs stored ${billTotal})`,
      diffCents: diff,
    };
  }

  // Check 5: Tax taxable + tax == total (applies to both modes)
  if (billTaxableCents + billTaxCents !== billTotal) {
    const diff = Number((billTaxableCents + billTaxCents) - billTotal);
    return {
      valid: false,
      error: `Bill totals mismatch, do not hand to customer: Tax breakdown mismatch (taxable ${billTaxableCents} + tax ${billTaxCents} != total ${billTotal})`,
      diffCents: diff,
    };
  }

  // Check 6: Payments sum verification
  let calculatedPaid = 0n;
  if (bill.payments && bill.payments.length > 0) {
    for (const payment of bill.payments) {
      calculatedPaid += BigInt(payment.amount_cents);
    }
  }

  if (calculatedPaid !== billPaid) {
    const diff = Number(calculatedPaid - billPaid);
    return {
      valid: false,
      error: `Bill totals mismatch, do not hand to customer: Payments sum mismatch (payments sum ${calculatedPaid} vs recorded paid ${billPaid})`,
      diffCents: diff,
    };
  }

  // Check 7: Change calculation verification
  if (billPaid < billTotal) {
    const diff = Number(billTotal - billPaid);
    return {
      valid: false,
      error: `Bill totals mismatch, do not hand to customer: Underpayment detected (paid ${billPaid} < total ${billTotal})`,
      diffCents: diff,
    };
  }

  const expectedChange = billPaid - billTotal;
  if (expectedChange !== billChange) {
    const diff = Number(expectedChange - billChange);
    return {
      valid: false,
      error: `Bill totals mismatch, do not hand to customer: Change calculation mismatch (expected ${expectedChange} vs stored ${billChange})`,
      diffCents: diff,
    };
  }

  return { valid: true };
}

/**
 * Logs a critical bill integrity violation to the audit_log table.
 */
export async function logBillIntegrityFailure(bill: Bill, error: string): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from('audit_log').insert({
      user_id: user?.id ?? null,
      action: 'bill.integrity_error',
      table_name: 'sales',
      record_id: bill.id,
      new_data: {
        bill_no: bill.bill_no,
        error,
        bill_id: bill.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Failed to write bill integrity failure to audit_log:', err);
  }
}

