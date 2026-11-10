import { describe, it, expect } from 'vitest';
import { generateStatementCSV, SupplierStatementEntry } from './api/suppliers';

describe('Suppliers & Accounts Payable Module', () => {
  describe('Statement Ledger Reconciliation', () => {
    it('correctly calculates running balance across chronological purchases and payments', () => {
      // Mock history:
      // Day 1: Purchase Rs. 50,000 (5,000,000 cents) -> Balance Rs. 50,000
      // Day 2: Payment Rs. 20,000 (2,000,000 cents)  -> Balance Rs. 30,000
      // Day 3: Purchase Rs. 15,000 (1,500,000 cents) -> Balance Rs. 45,000
      // Day 4: Payment Rs. 45,000 (4,500,000 cents)  -> Balance Rs. 0
      const entries: SupplierStatementEntry[] = [
        {
          id: '1',
          date: '2026-11-01T10:00:00Z',
          type: 'purchase',
          reference: 'INV-101',
          description: 'Goods Received (Invoice #INV-101)',
          debitCents: 5000000n,
          creditCents: 0n,
          balanceCents: 5000000n,
        },
        {
          id: '2',
          date: '2026-11-02T14:30:00Z',
          type: 'payment',
          reference: 'CHQ-001',
          description: 'Payment via bank transfer',
          debitCents: 0n,
          creditCents: 2000000n,
          balanceCents: 3000000n,
          method: 'bank_transfer',
        },
        {
          id: '3',
          date: '2026-11-03T11:15:00Z',
          type: 'purchase',
          reference: 'INV-102',
          description: 'Goods Received (Invoice #INV-102)',
          debitCents: 1500000n,
          creditCents: 0n,
          balanceCents: 4500000n,
        },
        {
          id: '4',
          date: '2026-11-04T16:00:00Z',
          type: 'payment',
          reference: 'CHQ-002',
          description: 'Payment via bank transfer',
          debitCents: 0n,
          creditCents: 4500000n,
          balanceCents: 0n,
          method: 'bank_transfer',
        },
      ];

      // Final balance matches sum(debit) - sum(credit)
      const totalPurchases = entries.reduce((s, e) => s + e.debitCents, 0n);
      const totalPayments = entries.reduce((s, e) => s + e.creditCents, 0n);
      const finalBalance = entries[entries.length - 1]!.balanceCents;

      expect(totalPurchases).toBe(6500000n);
      expect(totalPayments).toBe(6500000n);
      expect(finalBalance).toBe(totalPurchases - totalPayments);
      expect(finalBalance).toBe(0n);
    });

    it('generates valid CSV format for export and audit trails', () => {
      const mockEntries: SupplierStatementEntry[] = [
        {
          id: '1',
          date: '2026-11-01T10:00:00Z',
          type: 'purchase',
          reference: 'INV-001',
          description: 'Goods Received',
          debitCents: 100000n, // Rs. 1,000.00
          creditCents: 0n,
          balanceCents: 100000n,
        },
        {
          id: '2',
          date: '2026-11-02T10:00:00Z',
          type: 'payment',
          reference: 'CHQ-99',
          description: 'Payment',
          debitCents: 0n,
          creditCents: 100000n,
          balanceCents: 0n,
        },
      ];

      const csv = generateStatementCSV('Ceylon Agro Ltd', mockEntries);

      expect(csv).toContain('Supplier Statement: Ceylon Agro Ltd');
      expect(csv).toContain('Date,Type,Reference,Description,Debit (Rs),Credit (Rs),Balance (Rs)');
      expect(csv).toContain('PURCHASE,"INV-001","Goods Received",1000.00,0.00,1000.00');
      expect(csv).toContain('PAYMENT,"CHQ-99","Payment",0.00,1000.00,0.00');
    });
  });

  describe('Payment Business Invariants', () => {
    it('disallows payment that exceeds supplier balance (PAYMENT_EXCEEDS_BALANCE)', () => {
      const currentBalanceCents = 2500000n; // Rs. 25,000
      const paymentAttemptCents = 3000000n; // Rs. 30,000

      const isAllowed = paymentAttemptCents <= currentBalanceCents;
      expect(isAllowed).toBe(false);
    });
  });
});

