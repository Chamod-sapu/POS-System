/**
 * Central Error Mapper for Wewala POS
 * Translates PostgreSQL RPC, trigger, RLS and application error codes
 * into user-friendly, actionable English messages.
 * Also provides sanitized logging that strips credentials and tokens.
 */

export interface FormattedError {
  code: string;
  message: string;
  details?: string;
}

/**
 * Maps known database and domain error codes or exceptions to friendly English messages.
 */
export function mapErrorMessage(error: unknown): string {
  if (!error) {
    return 'An unexpected error occurred. Please try again.';
  }

  const rawMessage = typeof error === 'string'
    ? error
    : (error as Error)?.message || String(error);

  // 1. Authorization & Database Guard Errors
  if (rawMessage.includes('DIRECT_INSERT_FORBIDDEN')) {
    return 'Direct database insertion blocked. Transactions must be processed through checkout.';
  }
  if (rawMessage.includes('NOT_AUTHORISED') || rawMessage.includes('permission denied')) {
    return 'You do not have permission to perform this action.';
  }
  if (rawMessage.includes('FORBIDDEN')) {
    return 'Access denied. You do not have the required role privileges.';
  }
  if (rawMessage.includes('UNAUTHORIZED') || rawMessage.includes('Invalid or expired session token')) {
    return 'Your session has expired. Please log in again.';
  }

  // 2. Inventory & Stock Errors
  if (rawMessage.includes('OUT_OF_STOCK')) {
    // Format: OUT_OF_STOCK:<sku>:<available>
    const parts = rawMessage.split(':');
    if (parts.length >= 3 && parts[1] && parts[2]) {
      const sku = parts[1].trim();
      const available = parts[2].trim();
      return `Insufficient stock for product (${sku}). Only ${available} available.`;
    }
    return 'Insufficient stock available for one or more selected items.';
  }

  if (rawMessage.includes('PRODUCT_INACTIVE')) {
    const parts = rawMessage.split(':');
    const sku = parts[1]?.trim();
    return sku
      ? `Product (${sku}) is currently marked inactive and cannot be sold.`
      : 'This product is inactive and cannot be sold.';
  }

  if (rawMessage.includes('PRODUCT_NOT_FOUND')) {
    return 'The requested product could not be found in the catalog.';
  }

  if (rawMessage.includes('DECIMAL_QTY_NOT_ALLOWED')) {
    const parts = rawMessage.split(':');
    const sku = parts[1]?.trim();
    return sku
      ? `Product (${sku}) must be sold in whole units (no decimals allowed).`
      : 'This item must be sold in whole quantities.';
  }

  if (rawMessage.includes('INVALID_QUANTITY')) {
    return 'Item quantity must be greater than zero.';
  }

  // 3. Financial & Checkout Errors
  if (rawMessage.includes('DISCOUNT_NOT_ALLOWED') || rawMessage.includes('BILL_DISCOUNT_NOT_ALLOWED')) {
    return 'Discount exceeds the maximum allowed cashier discount limit (5%). Manager or Owner approval required.';
  }

  if (rawMessage.includes('INVALID_DISCOUNT_VALUE')) {
    return 'Discount cannot exceed the total price of the item or bill.';
  }

  if (rawMessage.includes('PAYMENT_EXCEEDS_REMAINING')) {
    return 'Payment amount exceeds the remaining bill balance.';
  }

  if (rawMessage.includes('TOTAL_MISMATCH')) {
    return 'The payment total does not match the final bill amount.';
  }

  if (rawMessage.includes('NO_ITEMS')) {
    return 'Cannot complete sale: Cart contains no items.';
  }

  if (rawMessage.includes('NO_PAYMENTS')) {
    return 'Cannot complete sale: No payments were added.';
  }

  if (rawMessage.includes('INVALID_PAYMENT_AMOUNT')) {
    return 'Payment amount must be greater than Rs. 0.00.';
  }

  // 4. Data Validation Errors
  if (rawMessage.includes('INVALID_PHONE')) {
    return 'Invalid Sri Lankan phone number. Please enter a valid mobile number (e.g. 0771234567 or +94771234567).';
  }

  if (rawMessage.includes('LAST_OWNER_PROTECTION') || rawMessage.includes('CANNOT_DEMOTE_LAST_OWNER')) {
    return 'Operation blocked: Cannot demote or deactivate the only active store owner.';
  }

  if (rawMessage.includes('DIRECT_INSERT_FORBIDDEN')) {
    return 'Direct database insertion blocked. Transactions must be processed through checkout.';
  }

  // 5. Shift & Cashier Errors
  if (rawMessage.includes('SHIFT_ALREADY_OPEN') || rawMessage.includes('idx_shifts_cashier_open')) {
    return 'You already have an active shift open. Please close your current shift first.';
  }

  if (rawMessage.includes('NO_OPEN_SHIFT')) {
    return 'A shift must be opened before processing sales. Please start your cashier shift.';
  }

  // 6. Network & Server Errors
  if (rawMessage.includes('Failed to fetch') || rawMessage.includes('NetworkError')) {
    return 'Network connection issue. Please check your internet connection.';
  }

  // 7. Supabase Unique Constraint Violations
  if (rawMessage.includes('categories_name_key') || rawMessage.includes('duplicate key value violates unique constraint "categories_name_key"')) {
    return 'A category with this name already exists.';
  }
  if (rawMessage.includes('products_sku_key')) {
    return 'A product with this SKU already exists.';
  }
  if (rawMessage.includes('products_barcode_key')) {
    return 'A product with this barcode already exists.';
  }

  // Default fallback
  return 'An unexpected error occurred. Please try again or contact the administrator.';
}

/**
 * Sanitizes errors by stripping passwords, tokens, and authorization headers
 * before recording to the browser console or monitoring service.
 */
export function logSanitizedError(error: unknown, context?: string): void {
  const sanitize = (val: unknown): unknown => {
    if (!val || typeof val !== 'object') return val;
    if (Array.isArray(val)) return val.map(sanitize);

    const safeObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      const lower = k.toLowerCase();
      if (
        lower.includes('password') ||
        lower.includes('token') ||
        lower.includes('auth') ||
        lower.includes('secret') ||
        lower.includes('key')
      ) {
        safeObj[k] = '[REDACTED]';
      } else if (typeof v === 'object' && v !== null) {
        safeObj[k] = sanitize(v);
      } else {
        safeObj[k] = v;
      }
    }
    return safeObj;
  };

  const errorObj = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { error };

  console.error(`[POS_ERROR${context ? ` : ${context}` : ''}]`, sanitize(errorObj));
}
