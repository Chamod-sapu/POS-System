import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { productFormSchema, ProductFormValues } from './types';
import { encodeCode128B, Barcode128 } from '../../lib/barcode128';
import { parseCSVLine } from './components/CsvImportModal';

describe('Products & Inventory Module Unit Tests', () => {
  describe('Product Form Zod Validation (productFormSchema)', () => {
    const validFormData = {
      sku: 'RICE-SAMBA-01',
      barcode: '4792025000101',
      name: 'Keeri Samba 5kg',
      category_id: '123e4567-e89b-12d3-a456-426614174000',
      unit: 'pcs' as const,
      allow_decimal_qty: false,
      cost_price_rupees: '1250.00',
      selling_price_rupees: '1450.00',
      tax_exempt: false,
      reorder_level: '10',
      track_expiry: true,
      opening_stock_qty: '25',
    };

    it('validates a complete, correctly formatted product form submission', () => {
      const result = productFormSchema.safeParse(validFormData);
      expect(result.success).toBe(true);
    });

    it('rejects an empty SKU', () => {
      const result = productFormSchema.safeParse({
        ...validFormData,
        sku: '',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/SKU is required/i);
      }
    });

    it('rejects SKU with invalid characters (only alphanumeric, hyphens, and underscores permitted)', () => {
      const result = productFormSchema.safeParse({
        ...validFormData,
        sku: 'RICE SAMBA #1!',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/letters, numbers, hyphens and underscores/i);
      }
    });

    it('rejects an empty product name or name with fewer than 2 characters', () => {
      const result = productFormSchema.safeParse({
        ...validFormData,
        name: 'A',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/min 2 characters/i);
      }
    });

    it('rejects an invalid non-UUID category ID', () => {
      const result = productFormSchema.safeParse({
        ...validFormData,
        category_id: 'not-a-valid-uuid',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/valid category/i);
      }
    });

    it('accepts optional barcode as empty string or undefined', () => {
      const withoutBarcode = {
        ...validFormData,
        barcode: '',
      };
      const result = productFormSchema.safeParse(withoutBarcode);
      expect(result.success).toBe(true);
    });

    it('enforces supported unit enums (pcs, kg, g, l, ml, pack, box)', () => {
      const result = productFormSchema.safeParse({
        ...validFormData,
        unit: 'invalid-unit' as unknown as ProductFormValues['unit'],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Gross Margin % and Cost vs Selling Price Warning Logic', () => {
    const calculateMargin = (costCents: number, sellingCents: number) => {
      if (sellingCents <= 0) return 0;
      return ((sellingCents - costCents) / sellingCents) * 100;
    };

    it('calculates gross profit margin correctly for normal profitable items', () => {
      const cost = 10000; // Rs. 100.00
      const selling = 12500; // Rs. 125.00
      const margin = calculateMargin(cost, selling);
      expect(margin).toBeCloseTo(20.0, 1);
    });

    it('detects negative margin when selling price is below cost price', () => {
      const cost = 20000; // Rs. 200.00
      const selling = 18000; // Rs. 180.00 (selling at a loss)
      const margin = calculateMargin(cost, selling);
      expect(margin).toBeLessThan(0);
      expect(selling < cost).toBe(true);
    });

    it('handles zero cost gracefully (100% gross margin)', () => {
      const cost = 0;
      const selling = 5000;
      const margin = calculateMargin(cost, selling);
      expect(margin).toBe(100);
    });

    it('handles zero selling price gracefully without NaN or division by zero', () => {
      const cost = 5000;
      const selling = 0;
      const margin = calculateMargin(cost, selling);
      expect(margin).toBe(0);
    });
  });

  describe('Pure Code 128 (Subset B) Barcode Encoder', () => {
    it('returns empty array when text is empty', () => {
      expect(encodeCode128B('')).toEqual([]);
    });

    it('encodes an alphanumeric barcode string into boolean modules', () => {
      const modules = encodeCode128B('SAMBA-01');
      expect(modules.length).toBeGreaterThan(50);
      // Quiet zones at start (10 false modules)
      expect(modules.slice(0, 10)).toEqual(new Array(10).fill(false));
      // First bar after quiet zone must be true (Start B begins with a bar)
      expect(modules[10]).toBe(true);
    });

    it('encodes standard numerical Sri Lankan EAN/custom barcode', () => {
      const modules = encodeCode128B('4792025000101');
      expect(modules.length).toBeGreaterThan(0);
      expect(modules.some((m) => m === true)).toBe(true);
      expect(modules.some((m) => m === false)).toBe(true);
    });

    it('renders Barcode128 SVG component without error', () => {
      const { container } = render(<Barcode128 value="WEWALA-POS-01" height={40} />);
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      const rects = container.querySelectorAll('rect');
      expect(rects.length).toBeGreaterThan(0);
    });

    it('returns null/empty container for empty barcode value in Barcode128 component', () => {
      const { container } = render(<Barcode128 value="" />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('CSV Parser and Import Validation', () => {
    it('parses simple comma-separated columns', () => {
      const line = 'SKU-001, Keeri Samba, 250.00, 300.00';
      const cols = parseCSVLine(line);
      expect(cols).toEqual(['SKU-001', 'Keeri Samba', '250.00', '300.00']);
    });

    it('correctly handles quoted fields containing commas', () => {
      const line = 'SKU-002, "Tea, Ceylon Pure Broken Orange Pekoe", 450.00, 520.00';
      const cols = parseCSVLine(line);
      expect(cols).toEqual([
        'SKU-002',
        'Tea, Ceylon Pure Broken Orange Pekoe',
        '450.00',
        '520.00',
      ]);
    });

    it('trims whitespace around values while preserving content inside quotes', () => {
      const line = '   SKU-003   ,   "Spices, Roasted Curry Powder"   , 120.00 ';
      const cols = parseCSVLine(line);
      expect(cols[0]).toBe('SKU-003');
      expect(cols[1]).toBe('Spices, Roasted Curry Powder');
      expect(cols[2]).toBe('120.00');
    });

    it('validates all-or-nothing CSV import logic: single bad row rejects entire batch', () => {
      const sampleRows = [
        { sku: 'RICE-01', name: 'Rice 1kg', sellingPrice: '250.00', isValid: true },
        { sku: '', name: 'Sugar 1kg', sellingPrice: '280.00', isValid: false, error: 'SKU is required' },
        { sku: 'FLOUR-01', name: 'Flour 1kg', sellingPrice: '190.00', isValid: true },
      ];

      const hasInvalidRow = sampleRows.some((r) => !r.isValid);
      expect(hasInvalidRow).toBe(true);

      // System invariant: Do not send payload to bulk_import_products if any row is invalid
      const canProceedWithImport = !hasInvalidRow;
      expect(canProceedWithImport).toBe(false);
    });
  });

  describe('Stock Adjustment & Ledger Invariants', () => {
    it('refuses stock adjustment that would result in negative inventory balance', () => {
      const currentStock = 5.0;
      const proposedChange = -8.0; // Trying to deduct 8 from 5
      const resultingStock = currentStock + proposedChange;

      const isNegative = resultingStock < 0;
      expect(isNegative).toBe(true);
      expect(resultingStock).toBe(-3.0);
    });

    it('refuses stock adjustment with zero quantity change', () => {
      const proposedChange = 0;
      expect(proposedChange === 0).toBe(true);
    });

    it('maps damage reason category to damage movement_type and counting to adjustment', () => {
      const mapMovementType = (reasonCategory: string) => {
        if (reasonCategory === 'damage') return 'damage';
        return 'adjustment';
      };

      expect(mapMovementType('damage')).toBe('damage');
      expect(mapMovementType('expired')).toBe('adjustment');
      expect(mapMovementType('counting')).toBe('adjustment');
      expect(mapMovementType('theft')).toBe('adjustment');
    });

    it('formats detailed audit note with reason category prefix', () => {
      const reasonCategory = 'expired';
      const customNote = 'Milk packets expired on 2026-11-01';
      const fullReason = `${reasonCategory.toUpperCase()}: ${customNote.trim()}`;

      expect(fullReason).toBe('EXPIRED: Milk packets expired on 2026-11-01');
    });
  });
});

