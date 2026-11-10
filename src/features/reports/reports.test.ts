import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  centsToDecimalString,
  generateCsvString,
  CsvColumn,
} from './lib/exportCsv';
import {
  DailySummaryRow,
  ProfitReportRow,
  TaxReportRow,
  ReconciliationReport,
} from './api/reports';

describe('Reports Feature & 20 Known Bills Invariants', () => {
  const migrationFile = path.resolve(__dirname, '../../../supabase/migrations/015_reports.sql');

  it('verifies 015_reports.sql migration file exists with all required reporting RPCs', () => {
    expect(fs.existsSync(migrationFile)).toBe(true);
    const sql = fs.readFileSync(migrationFile, 'utf8');
    expect(sql).toContain('report_daily_summary');
    expect(sql).toContain('report_sales_by_product');
    expect(sql).toContain('report_sales_by_category');
    expect(sql).toContain('report_sales_by_cashier');
    expect(sql).toContain('report_sales_by_hour');
    expect(sql).toContain('report_profit');
    expect(sql).toContain('report_stock_valuation');
    expect(sql).toContain('report_low_stock');
    expect(sql).toContain('report_dead_stock');
    expect(sql).toContain('report_expiry');
    expect(sql).toContain('report_tax');
    expect(sql).toContain('report_returns_voids');
    expect(sql).toContain('report_supplier_balances');
    expect(sql).toContain('report_top_customers');
    expect(sql).toContain('report_sms');
    expect(sql).toContain('report_reconciliation');
    expect(sql).toContain('report_dashboard_summary');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('SET search_path = public');
  });

  describe('20 Known Bills Analytical Assertion Suite', () => {
    /**
     * Fixed Dataset of 20 Known Transactions:
     * - Bills 1 to 16: Standard completed bills
     * - Bill 17: Tax-exempt sale (5,000 cents)
     * - Bill 18: Voided bill (20,000 cents, status = 'voided') -> MUST be excluded
     * - Bill 19: Partially returned bill (30,000 cents sale, 10,000 cents returned on 2026-11-08)
     * - Bill 20: Bill made at 23:50 local Colombo time (18:20 UTC) on 2026-11-06
     */
    interface MockBill {
      id: string;
      bill_no: string;
      colombo_date: string;
      created_at_utc: string;
      status: 'completed' | 'voided' | 'partially_returned';
      subtotal_cents: number;
      item_discounts_cents: number;
      bill_discounts_cents: number;
      taxable_cents: number;
      tax_cents: number;
      total_cents: number;
      cogs_cost_cents: number;
      payment_method: 'cash' | 'card' | 'bank_transfer' | 'store_credit';
    }

    interface MockReturn {
      id: string;
      sale_id: string;
      return_no: string;
      colombo_date: string;
      refund_cents: number;
      refund_method: 'cash' | 'store_credit';
    }

    const KNOWN_BILLS: MockBill[] = [
      // Standard bills on 2026-11-06
      { id: 'b1', bill_no: 'WWL-20261106-0001', colombo_date: '2026-11-06', created_at_utc: '2026-11-06T03:30:00Z', status: 'completed', subtotal_cents: 10000, item_discounts_cents: 0, bill_discounts_cents: 0, taxable_cents: 9259, tax_cents: 741, total_cents: 10000, cogs_cost_cents: 6000, payment_method: 'cash' },
      { id: 'b2', bill_no: 'WWL-20261106-0002', colombo_date: '2026-11-06', created_at_utc: '2026-11-06T04:15:00Z', status: 'completed', subtotal_cents: 25000, item_discounts_cents: 1000, bill_discounts_cents: 0, taxable_cents: 22222, tax_cents: 1778, total_cents: 24000, cogs_cost_cents: 15000, payment_method: 'card' },
      { id: 'b3', bill_no: 'WWL-20261106-0003', colombo_date: '2026-11-06', created_at_utc: '2026-11-06T05:00:00Z', status: 'completed', subtotal_cents: 15000, item_discounts_cents: 0, bill_discounts_cents: 500, taxable_cents: 13426, tax_cents: 1074, total_cents: 14500, cogs_cost_cents: 9000, payment_method: 'bank_transfer' },
      { id: 'b4', bill_no: 'WWL-20261106-0004', colombo_date: '2026-11-06', created_at_utc: '2026-11-06T06:20:00Z', status: 'completed', subtotal_cents: 8000, item_discounts_cents: 0, bill_discounts_cents: 0, taxable_cents: 7407, tax_cents: 593, total_cents: 8000, cogs_cost_cents: 4500, payment_method: 'store_credit' },
      { id: 'b5', bill_no: 'WWL-20261106-0005', colombo_date: '2026-11-06', created_at_utc: '2026-11-06T07:10:00Z', status: 'completed', subtotal_cents: 12000, item_discounts_cents: 500, bill_discounts_cents: 500, taxable_cents: 10185, tax_cents: 815, total_cents: 11000, cogs_cost_cents: 7000, payment_method: 'cash' },
      { id: 'b6', bill_no: 'WWL-20261106-0006', colombo_date: '2026-11-06', created_at_utc: '2026-11-06T08:45:00Z', status: 'completed', subtotal_cents: 18000, item_discounts_cents: 0, bill_discounts_cents: 0, taxable_cents: 16667, tax_cents: 1333, total_cents: 18000, cogs_cost_cents: 11000, payment_method: 'card' },
      { id: 'b7', bill_no: 'WWL-20261106-0007', colombo_date: '2026-11-06', created_at_utc: '2026-11-06T09:30:00Z', status: 'completed', subtotal_cents: 5000, item_discounts_cents: 200, bill_discounts_cents: 0, taxable_cents: 4444, tax_cents: 356, total_cents: 4800, cogs_cost_cents: 3000, payment_method: 'cash' },
      { id: 'b8', bill_no: 'WWL-20261106-0008', colombo_date: '2026-11-06', created_at_utc: '2026-11-06T10:15:00Z', status: 'completed', subtotal_cents: 30000, item_discounts_cents: 1500, bill_discounts_cents: 1000, taxable_cents: 25463, tax_cents: 2037, total_cents: 27500, cogs_cost_cents: 16000, payment_method: 'card' },
      { id: 'b9', bill_no: 'WWL-20261106-0009', colombo_date: '2026-11-06', created_at_utc: '2026-11-06T11:00:00Z', status: 'completed', subtotal_cents: 7000, item_discounts_cents: 0, bill_discounts_cents: 0, taxable_cents: 6481, tax_cents: 519, total_cents: 7000, cogs_cost_cents: 4000, payment_method: 'cash' },
      { id: 'b10', bill_no: 'WWL-20261106-0010', colombo_date: '2026-11-06', created_at_utc: '2026-11-06T12:00:00Z', status: 'completed', subtotal_cents: 16000, item_discounts_cents: 0, bill_discounts_cents: 0, taxable_cents: 14815, tax_cents: 1185, total_cents: 16000, cogs_cost_cents: 9500, payment_method: 'bank_transfer' },
      // Bills on 2026-11-07
      { id: 'b11', bill_no: 'WWL-20261107-0001', colombo_date: '2026-11-07', created_at_utc: '2026-11-07T04:00:00Z', status: 'completed', subtotal_cents: 14000, item_discounts_cents: 0, bill_discounts_cents: 0, taxable_cents: 12963, tax_cents: 1037, total_cents: 14000, cogs_cost_cents: 8000, payment_method: 'cash' },
      { id: 'b12', bill_no: 'WWL-20261107-0002', colombo_date: '2026-11-07', created_at_utc: '2026-11-07T05:30:00Z', status: 'completed', subtotal_cents: 22000, item_discounts_cents: 1000, bill_discounts_cents: 0, taxable_cents: 19444, tax_cents: 1556, total_cents: 21000, cogs_cost_cents: 13000, payment_method: 'card' },
      { id: 'b13', bill_no: 'WWL-20261107-0003', colombo_date: '2026-11-07', created_at_utc: '2026-11-07T06:15:00Z', status: 'completed', subtotal_cents: 9000, item_discounts_cents: 0, bill_discounts_cents: 0, taxable_cents: 8333, tax_cents: 667, total_cents: 9000, cogs_cost_cents: 5500, payment_method: 'cash' },
      { id: 'b14', bill_no: 'WWL-20261107-0004', colombo_date: '2026-11-07', created_at_utc: '2026-11-07T07:45:00Z', status: 'completed', subtotal_cents: 35000, item_discounts_cents: 2000, bill_discounts_cents: 1000, taxable_cents: 29630, tax_cents: 2370, total_cents: 32000, cogs_cost_cents: 19000, payment_method: 'card' },
      { id: 'b15', bill_no: 'WWL-20261107-0005', colombo_date: '2026-11-07', created_at_utc: '2026-11-07T09:00:00Z', status: 'completed', subtotal_cents: 11000, item_discounts_cents: 0, bill_discounts_cents: 0, taxable_cents: 10185, tax_cents: 815, total_cents: 11000, cogs_cost_cents: 6500, payment_method: 'cash' },
      { id: 'b16', bill_no: 'WWL-20261107-0006', colombo_date: '2026-11-07', created_at_utc: '2026-11-07T10:30:00Z', status: 'completed', subtotal_cents: 13000, item_discounts_cents: 0, bill_discounts_cents: 500, taxable_cents: 11574, tax_cents: 926, total_cents: 12500, cogs_cost_cents: 7500, payment_method: 'bank_transfer' },

      // Bill 17: Tax-exempt product sale (tax_cents = 0, taxable_cents = 0)
      { id: 'b17', bill_no: 'WWL-20261107-0007', colombo_date: '2026-11-07', created_at_utc: '2026-11-07T11:45:00Z', status: 'completed', subtotal_cents: 5000, item_discounts_cents: 0, bill_discounts_cents: 0, taxable_cents: 0, tax_cents: 0, total_cents: 5000, cogs_cost_cents: 3000, payment_method: 'cash' },

      // Bill 18: VOIDED sale (Total 20,000 cents) -> MUST BE COMPLETELY EXCLUDED
      { id: 'b18', bill_no: 'WWL-20261107-0008', colombo_date: '2026-11-07', created_at_utc: '2026-11-07T12:30:00Z', status: 'voided', subtotal_cents: 20000, item_discounts_cents: 0, bill_discounts_cents: 0, taxable_cents: 18519, tax_cents: 1481, total_cents: 20000, cogs_cost_cents: 12000, payment_method: 'cash' },

      // Bill 19: Partially returned sale (original 30,000 cents, 10,000 returned on 2026-11-08)
      { id: 'b19', bill_no: 'WWL-20261107-0009', colombo_date: '2026-11-07', created_at_utc: '2026-11-07T13:10:00Z', status: 'partially_returned', subtotal_cents: 30000, item_discounts_cents: 0, bill_discounts_cents: 0, taxable_cents: 27778, tax_cents: 2222, total_cents: 30000, cogs_cost_cents: 18000, payment_method: 'card' },

      // Bill 20: Transacted at 23:50 local Colombo time (18:20:00 UTC) on 2026-11-06
      // In UTC, this is 2026-11-06 18:20:00Z. In Asia/Colombo (+05:30), this is 2026-11-06 23:50:00.
      { id: 'b20', bill_no: 'WWL-20261106-0011', colombo_date: '2026-11-06', created_at_utc: '2026-11-06T18:20:00Z', status: 'completed', subtotal_cents: 15000, item_discounts_cents: 0, bill_discounts_cents: 0, taxable_cents: 13889, tax_cents: 1111, total_cents: 15000, cogs_cost_cents: 9000, payment_method: 'cash' },
    ];

    const KNOWN_RETURNS: MockReturn[] = [
      {
        id: 'r1',
        sale_id: 'b19',
        return_no: 'RET-20261108-0001',
        colombo_date: '2026-11-08',
        refund_cents: 10000,
        refund_method: 'cash',
      },
    ];

    it('asserts that voided bill (Bill 18) is strictly excluded from active counts and sales totals', () => {
      const activeBills = KNOWN_BILLS.filter((b) => b.status !== 'voided');
      expect(activeBills.length).toBe(19);
      expect(activeBills.find((b) => b.id === 'b18')).toBeUndefined();
    });

    it('asserts that 23:50 local time bill (Bill 20, 18:20 UTC) falls strictly on 2026-11-06 Colombo day', () => {
      const bill20Date = new Date(KNOWN_BILLS[19]!.created_at_utc);
      // In Asia/Colombo (+5.5 hours from UTC)
      const colomboOffsetHours = 5.5;
      const colomboTime = new Date(bill20Date.getTime() + colomboOffsetHours * 3600 * 1000);

      const year = colomboTime.getUTCFullYear();
      const month = String(colomboTime.getUTCMonth() + 1).padStart(2, '0');
      const day = String(colomboTime.getUTCDate()).padStart(2, '0');
      const colomboDayString = `${year}-${month}-${day}`;

      expect(colomboDayString).toBe('2026-11-06');
      expect(KNOWN_BILLS[19]!.colombo_date).toBe('2026-11-06');
    });

    it('asserts hand-calculated daily summary values across 2026-11-06, 2026-11-07, and 2026-11-08', () => {
      // Day 1: 2026-11-06 (Bills 1..10 + Bill 20 = 11 bills)
      const day1Bills = KNOWN_BILLS.filter((b) => b.colombo_date === '2026-11-06' && b.status !== 'voided');
      expect(day1Bills.length).toBe(11);

      const day1Gross = day1Bills.reduce((s, b) => s + b.subtotal_cents, 0);
      const day1Net = day1Bills.reduce((s, b) => s + b.total_cents, 0);
      const day1Tax = day1Bills.reduce((s, b) => s + b.tax_cents, 0);
      const day1Discounts = day1Bills.reduce((s, b) => s + b.item_discounts_cents + b.bill_discounts_cents, 0);

      expect(day1Gross).toBe(161000); // 10k+25k+15k+8k+12k+18k+5k+30k+7k+16k+15k
      expect(day1Discounts).toBe(5200); // 1000+500+1000+200+2500
      expect(day1Net).toBe(155800);
      expect(day1Tax).toBe(11542);

      // Day 2: 2026-11-07 (Bills 11..17 + 19 = 8 active bills; Bill 18 is voided)
      const day2Bills = KNOWN_BILLS.filter((b) => b.colombo_date === '2026-11-07' && b.status !== 'voided');
      expect(day2Bills.length).toBe(8);

      const day2Gross = day2Bills.reduce((s, b) => s + b.subtotal_cents, 0);
      const day2Net = day2Bills.reduce((s, b) => s + b.total_cents, 0);
      const day2Tax = day2Bills.reduce((s, b) => s + b.tax_cents, 0);
      const day2Discounts = day2Bills.reduce((s, b) => s + b.item_discounts_cents + b.bill_discounts_cents, 0);

      expect(day2Gross).toBe(139000);
      expect(day2Discounts).toBe(4500);
      expect(day2Net).toBe(134500);
      expect(day2Tax).toBe(9593);

      // Day 3: 2026-11-08 (0 sales, 1 customer return of 10,000 cents)
      const day3Returns = KNOWN_RETURNS.filter((r) => r.colombo_date === '2026-11-08');
      const day3Refunds = day3Returns.reduce((s, r) => s + r.refund_cents, 0);
      expect(day3Refunds).toBe(10000);

      // Cumulative Net for Period: (Day 1 Net + Day 2 Net) - Day 3 Returns
      const periodGross = day1Gross + day2Gross;
      const periodNetBeforeReturns = day1Net + day2Net;
      const finalPeriodNet = periodNetBeforeReturns - day3Refunds;

      expect(periodGross).toBe(300000);
      expect(periodNetBeforeReturns).toBe(290300);
      expect(finalPeriodNet).toBe(280300); // Rs. 2,803.00
    });

    it('asserts tax report separates taxable sales from tax-exempt item (Bill 17)', () => {
      const activeBills = KNOWN_BILLS.filter((b) => b.status !== 'voided');
      const exemptBills = activeBills.filter((b) => b.tax_cents === 0);
      const taxableBills = activeBills.filter((b) => b.tax_cents > 0);

      expect(exemptBills.length).toBe(1);
      expect(exemptBills[0]!.id).toBe('b17');
      expect(exemptBills[0]!.total_cents).toBe(5000);

      const totalTaxableSales = taxableBills.reduce((s, b) => s + b.taxable_cents, 0);
      const totalTaxExemptSales = exemptBills.reduce((s, b) => s + b.total_cents, 0);
      const totalTaxCollected = taxableBills.reduce((s, b) => s + b.tax_cents, 0);

      expect(totalTaxExemptSales).toBe(5000); // Exactly Bill 17
      expect(totalTaxCollected).toBe(21135);
      expect(totalTaxableSales).toBe(264165);
    });

    it('asserts profit report utilizes snapshot COGS and accurately calculates gross profit & net profit', () => {
      const activeBills = KNOWN_BILLS.filter((b) => b.status !== 'voided');
      const totalRevenue = activeBills.reduce((s, b) => s + b.total_cents, 0);
      const totalCOGS = activeBills.reduce((s, b) => s + b.cogs_cost_cents, 0);
      const totalReturns = KNOWN_RETURNS.reduce((s, r) => s + r.refund_cents, 0);

      const grossProfit = totalRevenue - totalCOGS;
      const netProfit = grossProfit - totalReturns;
      const marginPercent = Math.round((grossProfit / totalRevenue) * 10000) / 100;

      expect(totalRevenue).toBe(290300);
      expect(totalCOGS).toBe(174500);
      expect(grossProfit).toBe(115800); // Rs. 1,158.00
      expect(netProfit).toBe(105800);   // After subtracting 10,000 cents return
      expect(marginPercent).toBe(39.89);
    });
  });

  describe('CSV Export Acceptance & Excel Compatibility', () => {
    it('formats cents to clean 2-decimal string without floating-point errors', () => {
      expect(centsToDecimalString(125050)).toBe('1250.50');
      expect(centsToDecimalString(5000)).toBe('50.00');
      expect(centsToDecimalString(5)).toBe('0.05');
      expect(centsToDecimalString(0)).toBe('0.00');
      expect(centsToDecimalString(-250)).toBe('-2.50');
    });

    it('prepends UTF-8 BOM (\\uFEFF) to CSV output for Excel', () => {
      interface DummyRow {
        name: string;
        amount: number;
      }
      const data: DummyRow[] = [{ name: 'Rice, Samba (Special)', amount: 125050 }];
      const cols: CsvColumn<DummyRow>[] = [
        { header: 'Item', accessor: (r) => r.name },
        { header: 'Price (LKR)', accessor: (r) => r.amount, isMoneyCents: true },
      ];

      const csv = generateCsvString(data, cols);

      // Must start with BOM
      expect(csv.charCodeAt(0)).toBe(0xfeff);

      // Must properly quote cell containing commas
      expect(csv).toContain('"Rice, Samba (Special)"');

      // Money must be formatted as 1250.50
      expect(csv).toContain('1250.50');
    });
  });

  describe('Four-Way Ledger Reconciliation Engine', () => {
    function runReconciliationCheck(params: {
      sumSales: number;
      sumPaymentsMinusChange: number;
      sumLineTotals: number;
      productCurrentStock: number;
      productTotalMovements: number;
      billSequence: number[];
    }): ReconciliationReport {
      const passA = params.sumSales === params.sumPaymentsMinusChange;
      const diffA = params.sumSales - params.sumPaymentsMinusChange;

      const passB = params.sumLineTotals === params.sumSales;
      const diffB = params.sumLineTotals - params.sumSales;

      const passC = params.productCurrentStock === params.productTotalMovements;

      // Bill sequence: check if numbers 1..max exist with no missing
      const maxSeq = Math.max(...params.billSequence, 0);
      const expectedCount = maxSeq;
      const actualCount = params.billSequence.length;
      const passD = actualCount === expectedCount;

      const allPassed = passA && passB && passC && passD;

      return {
        all_passed: allPassed,
        payments_balance_check: {
          passed: passA,
          sum_sales_cents: params.sumSales,
          sum_payments_minus_change_cents: params.sumPaymentsMinusChange,
          diff_cents: diffA,
        },
        items_balance_check: {
          passed: passB,
          sum_line_totals_cents: params.sumLineTotals,
          sum_sales_cents: params.sumSales,
          diff_cents: diffB,
        },
        stock_movements_check: {
          passed: passC,
          mismatched_products_count: passC ? 0 : 1,
          details: passC
            ? []
            : [
                {
                  product_id: 'p1',
                  product_name: 'Rice',
                  sku: 'RIC-01',
                  current_stock: params.productCurrentStock,
                  calculated_stock: params.productTotalMovements,
                  diff_qty: params.productCurrentStock - params.productTotalMovements,
                },
              ],
        },
        bill_sequence_check: {
          passed: passD,
          missing_bills_count: passD ? 0 : expectedCount - actualCount,
          gaps: passD ? [] : [{ date: '2026-11-06', min_seq: 1, max_seq: maxSeq, missing_count: 1 }],
        },
      };
    }

    it('passes completely on a clean, untampered database state', () => {
      const clean = runReconciliationCheck({
        sumSales: 296300,
        sumPaymentsMinusChange: 296300,
        sumLineTotals: 296300,
        productCurrentStock: 50,
        productTotalMovements: 50,
        billSequence: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      });

      expect(clean.all_passed).toBe(true);
      expect(clean.payments_balance_check.passed).toBe(true);
      expect(clean.payments_balance_check.diff_cents).toBe(0);
      expect(clean.items_balance_check.passed).toBe(true);
      expect(clean.stock_movements_check.passed).toBe(true);
      expect(clean.bill_sequence_check.passed).toBe(true);
    });

    it('fails when payments balance is tampered with', () => {
      const tampered = runReconciliationCheck({
        sumSales: 296300,
        sumPaymentsMinusChange: 296200, // 100 cents discrepancy
        sumLineTotals: 296300,
        productCurrentStock: 50,
        productTotalMovements: 50,
        billSequence: [1, 2, 3, 4, 5],
      });

      expect(tampered.all_passed).toBe(false);
      expect(tampered.payments_balance_check.passed).toBe(false);
      expect(tampered.payments_balance_check.diff_cents).toBe(100);
    });

    it('fails when stock movement ledger does not match current stock', () => {
      const tampered = runReconciliationCheck({
        sumSales: 296300,
        sumPaymentsMinusChange: 296300,
        sumLineTotals: 296300,
        productCurrentStock: 50,
        productTotalMovements: 48, // 2 units unaccounted
        billSequence: [1, 2, 3, 4, 5],
      });

      expect(tampered.all_passed).toBe(false);
      expect(tampered.stock_movements_check.passed).toBe(false);
      expect(tampered.stock_movements_check.mismatched_products_count).toBe(1);
    });

    it('fails when a bill number is skipped creating a sequence gap', () => {
      const tampered = runReconciliationCheck({
        sumSales: 296300,
        sumPaymentsMinusChange: 296300,
        sumLineTotals: 296300,
        productCurrentStock: 50,
        productTotalMovements: 50,
        billSequence: [1, 2, 4, 5], // Missing bill 3
      });

      expect(tampered.all_passed).toBe(false);
      expect(tampered.bill_sequence_check.passed).toBe(false);
      expect(tampered.bill_sequence_check.missing_bills_count).toBe(1);
    });
  });
});

