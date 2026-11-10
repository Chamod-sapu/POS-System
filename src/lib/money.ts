/**
 * Wewala POS - Money and Precision Arithmetic Library
 * 
 * Strict Rules:
 * - Currency is LKR. All money is stored as integer cents (bigint).
 * - 1 LKR = 100 cents. Never use floating point for money.
 * - Quantities have up to 3 decimal places (numeric(12,3) in Postgres).
 * - Rounding is Round Half Up to whole cents.
 * - Calculation order mirrored 1:1 with Postgres create_sale():
 *   a. gross_line = round_half_up(quantity * unit_price_cents)
 *   b. line_discount = percent: round_half_up(gross_line * pct / 100), amount: the given cents; clamp to gross_line
 *   c. net_line = gross_line - line_discount
 *   d. items_net = sum(net_line)
 *   e. bill_discount = percent of items_net (round half up) or the given amount, clamped to items_net
 *   f. Allocate bill_discount across lines proportionally to net_line using largest-remainder method
 *      line_after = net_line - allocated
 *   g. Tax (only if tax_enabled, never on tax_exempt products):
 *      - exclusive: line_tax = round_half_up(line_after * rate / 100); total = sum(line_after) + sum(line_tax)
 *      - inclusive: line_tax = round_half_up(line_after * rate / (100 + rate)); total = sum(line_after)
 *   h. taxable_cents = total - tax_cents (so total = taxable + tax in both modes)
 *   i. line_total_cents = line_after + (line_tax if exclusive, else 0); sum(line_total_cents) === total
 */

export interface DiscountInput {
  type: 'none' | 'percent' | 'amount';
  value: number | string | bigint;
}

export interface BillLineInput {
  unitPriceCents: bigint;
  quantity: number | string | bigint;
  discountType?: 'none' | 'percent' | 'amount';
  discountValue?: number | string | bigint;
  lineDiscountCents?: bigint; // backward compatibility
  taxExempt?: boolean;
}

export interface BillLineResult {
  grossLine: bigint;
  lineDiscount: bigint;
  netLine: bigint;
  allocatedBillDiscount: bigint;
  lineAfter: bigint;
  lineTax: bigint;
  lineTotal: bigint;
}

export interface BillSummary {
  subtotal: bigint;       // Sum of line gross totals in cents
  lineDiscounts: bigint;  // Sum of individual line discounts in cents
  billDiscount: bigint;   // Clamped bill-level discount in cents
  taxableAmount: bigint;  // Base amount subject to tax in cents
  tax: bigint;            // Calculated tax amount in cents
  grandTotal: bigint;     // Final bill total in cents
  lines?: BillLineResult[];
}

export interface CalcBillOptions {
  lines: BillLineInput[];
  billDiscount?: DiscountInput | bigint;
  taxEnabled?: boolean;
  taxRatePercent?: number | string;
  taxInclusive?: boolean;
}

/**
 * Integer division with Round Half Up (symmetric away from zero).
 * Formula: quotient with remainder * 2 >= denominator rounded up by 1.
 */
export function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new Error('Division by zero in roundHalfUp');
  }

  let num = numerator;
  let den = denominator;
  if (den < 0n) {
    num = -num;
    den = -den;
  }

  const isNegative = num < 0n;
  const absNum = isNegative ? -num : num;

  const quotient = absNum / den;
  const remainder = absNum % den;

  const rounded = remainder * 2n >= den ? quotient + 1n : quotient;

  return isNegative ? -rounded : rounded;
}

/**
 * Converts a rupee string into integer cents without floating point arithmetic.
 * Examples:
 *   "1250.50" -> 125050n
 *   "1250" -> 125000n
 *   "0.05" -> 5n
 *   "0.005" -> 1n (0.005 rupees = 0.5 cents, rounds half up to 1 cent)
 */
export function toCents(rupeesString: string): bigint {
  const clean = rupeesString
    .replace(/^(Rs\.?|LKR)\s*/i, '')
    .replace(/,/g, '')
    .trim();

  if (clean === '') {
    throw new Error(`Invalid rupees string: "${rupeesString}"`);
  }

  const match = clean.match(/^([+-])?(\d+)?(?:\.(\d*))?$/);
  if (!match || (!match[2] && !match[3])) {
    throw new Error(`Invalid rupees string: "${rupeesString}"`);
  }

  const isNegative = match[1] === '-';
  const intStr = match[2] || '0';
  const decStr = match[3] || '';

  const intPart = BigInt(intStr);
  let centsFrac = 0n;

  if (decStr.length === 0) {
    centsFrac = 0n;
  } else if (decStr.length === 1) {
    centsFrac = BigInt(decStr) * 10n;
  } else if (decStr.length === 2) {
    centsFrac = BigInt(decStr);
  } else {
    // More than 2 decimal places: round half up to nearest cent
    const extraDigits = decStr.length - 2;
    const factor = 10n ** BigInt(extraDigits);
    centsFrac = roundHalfUp(BigInt(decStr), factor);
  }

  const totalCents = intPart * 100n + centsFrac;
  return isNegative ? -totalCents : totalCents;
}

/**
 * Formats integer cents into Sri Lankan Rupees with thousands separator and two decimals.
 * Output format: "Rs. 1,250.50" (or "-Rs. 1,250.50" for negative amounts)
 */
export function formatLKR(cents: bigint | number): string {
  const c = typeof cents === 'bigint' ? cents : BigInt(Math.trunc(cents));
  const isNegative = c < 0n;
  const absCents = isNegative ? -c : c;
  const rupees = absCents / 100n;
  const remCents = absCents % 100n;

  const formattedRupees = rupees.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formattedCents = remCents.toString().padStart(2, '0');

  return `${isNegative ? '-' : ''}Rs. ${formattedRupees}.${formattedCents}`;
}

/**
 * Parses quantity with up to 3 decimal places (numeric(12,3)) into integer thousandths.
 * e.g., "0.250" -> 250n thousandths, 1 -> 1000n thousandths.
 */
export function parseQuantityToThousandths(quantity: number | string | bigint): bigint {
  if (typeof quantity === 'bigint') {
    return quantity * 1000n;
  }

  const str = String(quantity).trim();
  if (str === '' || str === '0') return 0n;

  const match = str.match(/^([+-])?(\d+)?(?:\.(\d+))?$/);
  if (!match || (!match[2] && !match[3])) {
    throw new Error(`Invalid quantity format: "${quantity}"`);
  }

  const isNegative = match[1] === '-';
  const intStr = match[2] || '0';
  const decStr = match[3] || '';

  const intPart = BigInt(intStr);
  let thousandthsPart = 0n;

  if (decStr.length === 0) {
    thousandthsPart = 0n;
  } else if (decStr.length <= 3) {
    thousandthsPart = BigInt(decStr.padEnd(3, '0'));
  } else {
    const extraDigits = decStr.length - 3;
    const factor = 10n ** BigInt(extraDigits);
    thousandthsPart = roundHalfUp(BigInt(decStr), factor);
  }

  const total = intPart * 1000n + thousandthsPart;
  return isNegative ? -total : total;
}

/**
 * Parses a percentage with up to 2 decimal places into integer basis points (100% = 10,000 bp).
 * e.g., 15% -> 1500n, 2.5% -> 250n, 0.05% -> 5n.
 */
export function parsePercentToBasisPoints(percent: number | string | bigint): bigint {
  if (typeof percent === 'bigint') {
    return percent * 100n;
  }

  const str = String(percent).trim();
  if (str === '' || str === '0') return 0n;

  const match = str.match(/^([+-])?(\d+)?(?:\.(\d+))?$/);
  if (!match || (!match[2] && !match[3])) {
    throw new Error(`Invalid percent format: "${percent}"`);
  }

  const isNegative = match[1] === '-';
  const intStr = match[2] || '0';
  const decStr = match[3] || '';

  const intPart = BigInt(intStr);
  let bpFrac = 0n;

  if (decStr.length === 0) {
    bpFrac = 0n;
  } else if (decStr.length <= 2) {
    bpFrac = BigInt(decStr.padEnd(2, '0'));
  } else {
    const extraDigits = decStr.length - 2;
    const factor = 10n ** BigInt(extraDigits);
    bpFrac = roundHalfUp(BigInt(decStr), factor);
  }

  const totalBp = intPart * 100n + bpFrac;
  return isNegative ? -totalBp : totalBp;
}

/**
 * Calculates line total in cents. Quantity has up to 3 decimals.
 * Result rounded half up to whole cents.
 */
export function lineTotal(
  unitPriceCents: bigint,
  quantity: number | string | bigint
): bigint {
  const thousandths = parseQuantityToThousandths(quantity);
  return roundHalfUp(unitPriceCents * thousandths, 1000n);
}

/**
 * Computes a percentage of a given amount in cents, rounded half up.
 */
export function percentOf(cents: bigint, percentWithTwoDecimals: number | string | bigint): bigint {
  const bp = parsePercentToBasisPoints(percentWithTwoDecimals);
  return roundHalfUp(cents * bp, 10000n);
}

/**
 * Allocates a total discount across multiple line net amounts proportionally
 * using the Largest-Remainder Method (Hare-Niemeyer / Hamilton method) so that
 * the allocated amounts sum EXACTLY to billDiscount.
 */
export function allocateBillDiscount(netLines: bigint[], billDiscount: bigint): bigint[] {
  const count = netLines.length;
  if (count === 0 || billDiscount <= 0n) {
    return new Array(count).fill(0n);
  }

  const totalNet = netLines.reduce((acc, val) => acc + val, 0n);
  if (totalNet <= 0n) {
    return new Array(count).fill(0n);
  }

  const clampedDiscount = billDiscount > totalNet ? totalNet : billDiscount;

  const baseAllocs: bigint[] = new Array(count).fill(0n);
  const remainders: bigint[] = new Array(count).fill(0n);
  let baseAllocSum = 0n;

  for (let i = 0; i < count; i++) {
    const net = netLines[i]!;
    if (net <= 0n) {
      baseAllocs[i] = 0n;
      remainders[i] = 0n;
      continue;
    }
    const base = (clampedDiscount * net) / totalNet;
    const rem = (clampedDiscount * net) % totalNet;
    baseAllocs[i] = base;
    remainders[i] = rem;
    baseAllocSum += base;
  }

  const remainderCents = Number(clampedDiscount - baseAllocSum);

  // Rank lines by remainder descending, tie-breaking by line index ascending
  const indices = Array.from({ length: count }, (_, i) => i);
  indices.sort((a, b) => {
    const remA = remainders[a]!;
    const remB = remainders[b]!;
    if (remB > remA) return 1;
    if (remB < remA) return -1;
    return a - b;
  });

  const allocated = [...baseAllocs];
  for (let r = 0; r < remainderCents; r++) {
    const idx = indices[r]!;
    allocated[idx] = (allocated[idx] ?? 0n) + 1n;
  }

  return allocated;
}

/**
 * Normalizes Sri Lankan phone numbers:
 * 07XXXXXXXX, 7XXXXXXXX, +947XXXXXXXX, 947XXXXXXXX -> +947XXXXXXXX
 */
export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '').trim();
  if (/^07[0-9]{8}$/.test(cleaned)) {
    return '+94' + cleaned.substring(1);
  } else if (/^7[0-9]{8}$/.test(cleaned)) {
    return '+94' + cleaned;
  } else if (/^\+947[0-9]{8}$/.test(cleaned)) {
    return cleaned;
  } else if (/^947[0-9]{8}$/.test(cleaned)) {
    return '+' + cleaned;
  } else {
    throw new Error('INVALID_PHONE');
  }
}

/**
 * Calculates bill financial totals according to documented schema rules (steps 6a - 6i):
 * a. gross_line = round_half_up(quantity * unit_price_cents)
 * b. line_discount = percent: round_half_up(gross_line * pct / 100), amount: the given cents; clamp to gross_line
 * c. net_line = gross_line - line_discount
 * d. items_net = sum(net_line)
 * e. bill_discount = percent of items_net (round half up) or the given amount, clamped to items_net
 * f. Allocate bill_discount across lines proportionally to net_line using the largest-remainder method
 *    line_after = net_line - allocated
 * g. Tax (only if tax_enabled, never on tax_exempt products):
 *    - tax exclusive: line_tax = round_half_up(line_after * rate / 100); total = sum(line_after) + sum(line_tax)
 *    - tax inclusive: line_tax = round_half_up(line_after * rate / (100 + rate)); total = sum(line_after)
 * h. taxable_cents = total - tax_cents (so total = taxable + tax in both modes)
 * i. line_total_cents = line_after + (line_tax if exclusive, else 0); sum(line_total_cents) === total
 */
export function calcBill({
  lines,
  billDiscount = 0n,
  taxEnabled,
  taxRatePercent = 0,
  taxInclusive = false,
}: CalcBillOptions): BillSummary {
  let subtotal = 0n;
  let totalLineDiscounts = 0n;
  let itemsNet = 0n;

  const grossLines: bigint[] = [];
  const lineDiscounts: bigint[] = [];
  const netLines: bigint[] = [];

  // Step 6a, 6b, 6c: Per-line gross, line discount, and net
  for (const line of lines) {
    const gross = lineTotal(line.unitPriceCents, line.quantity);
    let lineDisc = 0n;

    if (line.discountType === 'percent') {
      lineDisc = percentOf(gross, line.discountValue ?? 0);
    } else if (line.discountType === 'amount') {
      lineDisc = typeof line.discountValue === 'bigint' 
        ? line.discountValue 
        : BigInt(line.discountValue ?? 0);
    } else if (line.lineDiscountCents !== undefined) {
      lineDisc = line.lineDiscountCents;
    }

    if (gross >= 0n) {
      if (lineDisc < 0n) lineDisc = 0n;
      if (lineDisc > gross) lineDisc = gross;
    } else {
      lineDisc = 0n;
    }

    const net = gross - lineDisc;

    grossLines.push(gross);
    lineDiscounts.push(lineDisc);
    netLines.push(net);

    subtotal += gross;
    totalLineDiscounts += lineDisc;
    itemsNet += net;
  }

  // Step 6e: Bill-level discount calculation & clamping
  let calculatedBillDiscount = 0n;
  if (typeof billDiscount === 'object' && 'type' in billDiscount) {
    if (billDiscount.type === 'percent') {
      calculatedBillDiscount = percentOf(itemsNet, billDiscount.value);
    } else if (billDiscount.type === 'amount') {
      calculatedBillDiscount = typeof billDiscount.value === 'bigint'
        ? billDiscount.value
        : BigInt(billDiscount.value);
    }
  } else if (typeof billDiscount === 'bigint') {
    calculatedBillDiscount = billDiscount;
  }

  if (calculatedBillDiscount < 0n) {
    calculatedBillDiscount = 0n;
  }
  if (itemsNet <= 0n) {
    calculatedBillDiscount = 0n;
  } else if (calculatedBillDiscount > itemsNet) {
    calculatedBillDiscount = itemsNet;
  }

  // Step 6f: Allocate bill_discount across lines proportionally (Largest-Remainder Method)
  const allocatedBillDiscounts = allocateBillDiscount(netLines, calculatedBillDiscount);
  const lineAfters: bigint[] = [];
  for (let i = 0; i < netLines.length; i++) {
    lineAfters.push(netLines[i]! - allocatedBillDiscounts[i]!);
  }

  // Step 6g: Tax calculations per line
  const taxRateBp = parsePercentToBasisPoints(taxRatePercent);
  const isTaxActive = taxEnabled ?? (taxRateBp > 0n);

  const lineTaxes: bigint[] = [];
  const lineTotals: bigint[] = [];
  let totalTax = 0n;
  let sumLineTotals = 0n;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const after = lineAfters[i]!;
    let lTax = 0n;

    if (isTaxActive && !line.taxExempt && taxRateBp > 0n) {
      if (taxInclusive) {
        lTax = roundHalfUp(after * taxRateBp, 10000n + taxRateBp);
      } else {
        lTax = roundHalfUp(after * taxRateBp, 10000n);
      }
    }

    lineTaxes.push(lTax);
    totalTax += lTax;

    const lTotal = after + (!taxInclusive ? lTax : 0n);
    lineTotals.push(lTotal);
    sumLineTotals += lTotal;
  }

  let grandTotal = 0n;
  if (!taxInclusive) {
    grandTotal = (itemsNet - calculatedBillDiscount) + totalTax;
  } else {
    grandTotal = itemsNet - calculatedBillDiscount;
  }

  // Step 6h: Taxable cents
  const taxableAmount = grandTotal - totalTax;

  // Step 6i: Assert line totals sum equals grand total
  if (sumLineTotals !== grandTotal) {
    throw new Error('TOTAL_MISMATCH');
  }

  const lineResults: BillLineResult[] = lines.map((_, i) => ({
    grossLine: grossLines[i]!,
    lineDiscount: lineDiscounts[i]!,
    netLine: netLines[i]!,
    allocatedBillDiscount: allocatedBillDiscounts[i]!,
    lineAfter: lineAfters[i]!,
    lineTax: lineTaxes[i]!,
    lineTotal: lineTotals[i]!,
  }));

  return {
    subtotal,
    lineDiscounts: totalLineDiscounts,
    billDiscount: calculatedBillDiscount,
    taxableAmount,
    tax: totalTax,
    grandTotal,
    lines: lineResults,
  };
}
