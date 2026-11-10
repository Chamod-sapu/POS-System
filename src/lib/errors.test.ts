import { describe, it, expect, vi } from 'vitest';
import { mapErrorMessage, logSanitizedError } from './errors';

describe('Central Error Mapper', () => {
  it('maps authorization errors correctly', () => {
    expect(mapErrorMessage('NOT_AUTHORISED')).toContain('permission');
    expect(mapErrorMessage('new row violates row-level security policy (permission denied)')).toContain(
      'permission'
    );
    expect(mapErrorMessage('FORBIDDEN')).toContain('Access denied');
  });

  it('maps inventory and stock errors correctly', () => {
    expect(mapErrorMessage('OUT_OF_STOCK:RICE-001:5.500')).toBe(
      'Insufficient stock for product (RICE-001). Only 5.500 available.'
    );
    expect(mapErrorMessage('OUT_OF_STOCK')).toContain('Insufficient stock');
    expect(mapErrorMessage('PRODUCT_INACTIVE:DAIRY-002')).toContain('inactive and cannot be sold');
    expect(mapErrorMessage('DECIMAL_QTY_NOT_ALLOWED:EGG-001')).toContain('whole units');
    expect(mapErrorMessage('INVALID_QUANTITY:ITEM-01')).toContain('greater than zero');
    expect(mapErrorMessage('PRODUCT_NOT_FOUND')).toContain('could not be found');
  });

  it('maps financial and checkout errors correctly', () => {
    expect(mapErrorMessage('DISCOUNT_NOT_ALLOWED')).toContain('5%');
    expect(mapErrorMessage('BILL_DISCOUNT_NOT_ALLOWED')).toContain('5%');
    expect(mapErrorMessage('INVALID_DISCOUNT_VALUE')).toContain('cannot exceed');
    expect(mapErrorMessage('PAYMENT_EXCEEDS_REMAINING')).toContain('exceeds the remaining bill');
    expect(mapErrorMessage('TOTAL_MISMATCH')).toContain('does not match the final bill');
    expect(mapErrorMessage('NO_ITEMS')).toContain('Cart contains no items');
    expect(mapErrorMessage('NO_PAYMENTS')).toContain('No payments were added');
    expect(mapErrorMessage('INVALID_PAYMENT_AMOUNT')).toContain('greater than Rs. 0.00');
  });

  it('maps phone, owner protection and trigger errors correctly', () => {
    expect(mapErrorMessage('INVALID_PHONE')).toContain('Sri Lankan phone number');
    expect(mapErrorMessage('LAST_OWNER_PROTECTION')).toContain('only active store owner');
    expect(mapErrorMessage('CANNOT_DEMOTE_LAST_OWNER')).toContain('only active store owner');
    expect(mapErrorMessage('DIRECT_INSERT_FORBIDDEN')).toContain('checkout');
    expect(mapErrorMessage('SHIFT_ALREADY_OPEN')).toContain('active shift open');
    expect(mapErrorMessage('NO_OPEN_SHIFT')).toContain('shift must be opened');
    expect(mapErrorMessage('duplicate key value violates unique constraint "categories_name_key"')).toContain(
      'category with this name already exists'
    );
  });

  it('maps unknown errors to a safe generic message', () => {
    expect(mapErrorMessage(new Error('Unknown postgres internal error #99872'))).toBe(
      'An unexpected error occurred. Please try again or contact the administrator.'
    );
    expect(mapErrorMessage(null)).toContain('unexpected error occurred');
  });

  it('sanitizes passwords and sensitive keys before logging', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sensitivePayload = {
      message: 'Failed login',
      password: 'SuperSecretPassword123!',
      authToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      apiKey: 'secret-key-456',
      user: {
        id: 'u-1',
        authSecret: 'hidden-secret',
      },
    };

    logSanitizedError(sensitivePayload, 'AuthLogin');

    expect(consoleSpy).toHaveBeenCalled();
    const loggedArg = consoleSpy.mock.calls[0]?.[1] as Record<string, unknown>;
    const errorObj = loggedArg.error as Record<string, unknown>;

    expect(errorObj.password).toBe('[REDACTED]');
    expect(errorObj.authToken).toBe('[REDACTED]');
    expect(errorObj.apiKey).toBe('[REDACTED]');

    const userObj = errorObj.user as Record<string, unknown>;
    expect(userObj.authSecret).toBe('[REDACTED]');
    expect(userObj.id).toBe('u-1');

    consoleSpy.mockRestore();
  });
});

