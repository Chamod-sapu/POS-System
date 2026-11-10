import { describe, it, expect } from 'vitest';
import { normalizeSriLankanPhone } from './api/customers';

describe('Customers Module', () => {
  describe('Phone Number Normalization (E.164 +94XXXXXXXXX)', () => {
    it('normalizes standard 10-digit Sri Lankan mobile starting with 0', () => {
      expect(normalizeSriLankanPhone('0771234567')).toBe('+94771234567');
      expect(normalizeSriLankanPhone('0712345678')).toBe('+94712345678');
      expect(normalizeSriLankanPhone('0765554321')).toBe('+94765554321');
    });

    it('normalizes 9-digit format without leading 0', () => {
      expect(normalizeSriLankanPhone('771234567')).toBe('+94771234567');
      expect(normalizeSriLankanPhone('701234567')).toBe('+94701234567');
    });

    it('handles numbers already starting with +94', () => {
      expect(normalizeSriLankanPhone('+94771234567')).toBe('+94771234567');
    });

    it('strips spaces, hyphens, and whitespace before normalising', () => {
      expect(normalizeSriLankanPhone(' 077 - 123 - 4567 ')).toBe('+94771234567');
      expect(normalizeSriLankanPhone('+94 77 123 4567')).toBe('+94771234567');
    });

    it('rejects invalid numbers or incorrect lengths', () => {
      expect(() => normalizeSriLankanPhone('')).toThrow();
      expect(() => normalizeSriLankanPhone('12345')).toThrow();
      expect(() => normalizeSriLankanPhone('077123456789')).toThrow(); // too long
      expect(() => normalizeSriLankanPhone('abc077123456')).toThrow();
    });
  });

  describe('Loyalty Points Calculation Invariant', () => {
    // Formula from migration 013_loyalty.sql: floor((total_cents / 10000) * rate)
    // where 10000 cents = 100 LKR
    function calculateLoyaltyPoints(totalCents: number, ratePer100Lkr: number): number {
      return Math.floor((totalCents / 10000) * ratePer100Lkr);
    }

    it('awards 1 point per 100 LKR by default', () => {
      // Rs. 250 = 25,000 cents -> 2 points
      expect(calculateLoyaltyPoints(25000, 1.0)).toBe(2);
      // Rs. 99 = 9,900 cents -> 0 points
      expect(calculateLoyaltyPoints(9900, 1.0)).toBe(0);
      // Rs. 100 = 10,000 cents -> 1 point
      expect(calculateLoyaltyPoints(10000, 1.0)).toBe(1);
      // Rs. 1,000 = 100,000 cents -> 10 points
      expect(calculateLoyaltyPoints(100000, 1.0)).toBe(10);
    });

    it('respects custom shop rate per 100 LKR', () => {
      // 2.5 points per 100 LKR
      // Rs. 500 = 50,000 cents -> floor(5 * 2.5) = floor(12.5) = 12 points
      expect(calculateLoyaltyPoints(50000, 2.5)).toBe(12);
      // Rs. 1,000 = 100,000 cents -> floor(10 * 2.5) = 25 points
      expect(calculateLoyaltyPoints(100000, 2.5)).toBe(25);
    });
  });
});

