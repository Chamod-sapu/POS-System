import { describe, it, expect } from 'vitest';
import { sanitizePostgrestFilter } from './supabase';

describe('sanitizePostgrestFilter', () => {
  it('strips PostgREST operator injection characters (commas, parens, wildcards, quotes)', () => {
    expect(sanitizePostgrestFilter('milk,is_active.eq.false')).toBe('milkis_active.eq.false');
    expect(sanitizePostgrestFilter('a),phone.ilike.%077%')).toBe('aphone.ilike.077');
    expect(sanitizePostgrestFilter('*"test\\%\'\\\r\n')).toBe('test');
  });

  it('preserves benign barcode, SKU, phone, and dot-decimal identifiers', () => {
    expect(sanitizePostgrestFilter(' 8901234567890 ')).toBe('8901234567890');
    expect(sanitizePostgrestFilter('SKU-1.5_A + 0771234567')).toBe('SKU-1.5_A + 0771234567');
  });

  it('caps length at 120 characters', () => {
    const longInput = 'a'.repeat(200);
    expect(sanitizePostgrestFilter(longInput).length).toBe(120);
  });
});
