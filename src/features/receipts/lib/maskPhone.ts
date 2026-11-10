/**
 * Masks Sri Lankan phone numbers for privacy on customer receipts.
 * Example output: "077****123"
 */
export function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return '';

  const clean = phone.trim();
  if (clean.length === 0) return '';

  // If in international format +94771234567, convert to local standard 0771234567
  let normalized = clean;
  if (normalized.startsWith('+94')) {
    normalized = '0' + normalized.slice(3);
  } else if (normalized.startsWith('94') && normalized.length === 11) {
    normalized = '0' + normalized.slice(2);
  }

  // Format as prefix3 + '****' + suffix3
  if (normalized.length >= 7) {
    const prefix = normalized.slice(0, 3);
    const suffix = normalized.slice(-3);
    return `${prefix}****${suffix}`;
  }

  // Fallback for unusually short numbers
  if (normalized.length > 4) {
    return `${normalized.slice(0, 2)}****${normalized.slice(-2)}`;
  }

  return '****';
}

