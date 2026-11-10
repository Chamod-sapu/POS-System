import { Bill, PaperWidth } from '../types';
import { formatLKR } from '../../../lib/money';
import { maskPhoneNumber } from './maskPhone';

/**
 * Word wraps text into lines where each line is at most `maxWidth` characters.
 * Handles existing newlines, long words without spaces, and preserves words.
 */
export function wrapText(text: string, maxWidth: number): string[] {
  if (!text) return [];
  const lines: string[] = [];
  const rawLines = text.split('\n');

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) {
      lines.push('');
      continue;
    }

    const words = trimmed.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      if (word.length > maxWidth) {
        // Break abnormally long word across lines
        if (currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = '';
        }
        for (let i = 0; i < word.length; i += maxWidth) {
          lines.push(word.slice(i, i + maxWidth));
        }
      } else if (currentLine.length === 0) {
        currentLine = word;
      } else if (currentLine.length + 1 + word.length <= maxWidth) {
        currentLine += ' ' + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
  }

  return lines;
}

/**
 * Centers text within a given column width. Truncates or clamps if longer.
 */
export function centerText(text: string, width: number): string {
  if (text.length >= width) {
    return text.slice(0, width);
  }
  const leftPadding = Math.floor((width - text.length) / 2);
  const rightPadding = width - text.length - leftPadding;
  return ' '.repeat(leftPadding) + text + ' '.repeat(rightPadding);
}

/**
 * Formats a two-column line with left and right text, padded with spaces.
 * If left + right > width, truncates or aligns appropriately.
 */
export function padLine(left: string, right: string, width: number): string {
  const combinedLen = left.length + right.length;
  if (combinedLen < width) {
    const spaces = width - combinedLen;
    return left + ' '.repeat(spaces) + right;
  }
  if (combinedLen === width) {
    return left + right;
  }
  // Exceeds width: clamp left text to fit right text with at least 1 space
  const maxLeft = Math.max(0, width - right.length - 1);
  return left.slice(0, maxLeft) + ' ' + right;
}

/**
 * Formats ISO date into Asia/Colombo standard 24h string.
 * Example: "2026-11-10 14:35:22"
 */
export function formatReceiptDate(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;

    // Use Intl to format in Asia/Colombo time
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Colombo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(d);
    const map: Record<string, string> = {};
    for (const part of parts) {
      map[part.type] = part.value;
    }

    return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
  } catch {
    return dateString;
  }
}

/**
 * Pure function that formats a complete Bill JSON into fixed-width plain text
 * for 80mm (42 columns) or 58mm (32 columns) thermal printers.
 * Strictly guarantees every returned line length is <= column width.
 * Never recalculates money amounts; only formats integer cents.
 */
export function formatReceiptPlainText(bill: Bill, paperWidth: PaperWidth): string {
  const cols = paperWidth === '58mm' ? 32 : 42;
  const isDuplicate = Boolean(bill.is_duplicate || bill.print_count >= 1);
  const out: string[] = [];

  const addLine = (line: string) => {
    // Ensure line never exceeds cols
    if (line.length > cols) {
      out.push(line.slice(0, cols));
    } else {
      out.push(line);
    }
  };

  const addDashed = () => {
    addLine('-'.repeat(cols));
  };

  // 1. DUPLICATE COPY at top if print_count >= 1
  if (isDuplicate) {
    addLine(centerText('*** DUPLICATE COPY ***', cols));
  }

  // 2. Shop Header (name bold/centred, address, phone, VAT reg no)
  const shopNameLines = wrapText(bill.shop.name || 'Wewala Store', cols);
  for (const l of shopNameLines) {
    addLine(centerText(l, cols));
  }

  if (bill.shop.address) {
    const addrLines = wrapText(bill.shop.address, cols);
    for (const l of addrLines) {
      addLine(centerText(l, cols));
    }
  }

  if (bill.shop.phone) {
    addLine(centerText(`Tel: ${bill.shop.phone}`, cols));
  }

  if (bill.shop.vat_reg_no) {
    addLine(centerText(`VAT Reg: ${bill.shop.vat_reg_no}`, cols));
  }

  // 3. Dashed line
  addDashed();

  // 4. Bill Metadata
  addLine(padLine('Bill No:', bill.bill_no, cols));
  addLine(padLine('Date:', formatReceiptDate(bill.date_time), cols));
  addLine(padLine('Cashier:', bill.cashier?.name || 'Cashier', cols));

  if (bill.customer) {
    const maskedPhone = maskPhoneNumber(bill.customer.phone);
    let custVal = '';
    if (bill.customer.name && maskedPhone) {
      custVal = `${bill.customer.name} (${maskedPhone})`;
    } else if (maskedPhone) {
      custVal = maskedPhone;
    } else if (bill.customer.name) {
      custVal = bill.customer.name;
    }

    if (custVal) {
      const custLines = wrapText(`Customer: ${custVal}`, cols);
      for (const cl of custLines) {
        addLine(cl);
      }
    }
  }

  // 5. Dashed line
  addDashed();

  // 6. Column header (Item, Qty x Price, Total)
  if (cols === 42) {
    addLine('Item                  Qty x Price    Total');
  } else {
    addLine('Item         Qty x Price   Total');
  }

  // 7. Line items
  for (const item of bill.lines) {
    // Product name (wrapping onto extra lines if long)
    const nameLines = wrapText(item.name, cols);
    for (const nl of nameLines) {
      addLine(nl);
    }

    // Qty x Price and line total
    const formattedQty = Number.isInteger(item.quantity)
      ? `${item.quantity}`
      : `${item.quantity.toFixed(3).replace(/\.?0+$/, '')}`;
    const qtyPriceStr = `  ${formattedQty} ${item.unit} x ${formatLKR(item.unit_price_cents)}`;
    const lineTotalStr = formatLKR(item.line_total_cents);

    if (qtyPriceStr.length + lineTotalStr.length + 1 <= cols) {
      addLine(padLine(qtyPriceStr, lineTotalStr, cols));
    } else {
      // If combined length is too wide for one line (e.g. on 58mm), print on 2 lines
      addLine(qtyPriceStr.slice(0, cols));
      addLine(padLine('', lineTotalStr, cols));
    }

    // Line discount if present
    if (item.line_discount_cents > 0) {
      addLine(padLine('  Discount:', `-${formatLKR(item.line_discount_cents)}`, cols));
    }
  }

  // 8. Dashed line
  addDashed();

  // 9. Financial Summary
  addLine(padLine('Subtotal', formatLKR(bill.subtotal_cents), cols));

  if (bill.line_discount_cents > 0) {
    addLine(padLine('Item Discounts', `-${formatLKR(bill.line_discount_cents)}`, cols));
  }

  if (bill.bill_discount_cents > 0) {
    addLine(padLine('Bill Discount', `-${formatLKR(bill.bill_discount_cents)}`, cols));
  }

  if (bill.tax) {
    const modeStr = bill.tax.mode === 'inclusive' ? 'incl.' : 'excl.';
    const taxLabel = `Tax (${bill.tax.rate_percent}% ${modeStr})`;
    addLine(padLine(taxLabel, formatLKR(bill.tax.tax_cents), cols));
  }

  addLine(padLine('TOTAL', formatLKR(bill.total_cents), cols));

  // 10. Payments Breakdown
  if (bill.payments && bill.payments.length > 0) {
    for (const payment of bill.payments) {
      const method = payment.method.toUpperCase().replace('_', ' ');
      const label = payment.reference ? `  ${method} (${payment.reference})` : `  ${method}`;
      addLine(padLine(label, formatLKR(payment.amount_cents), cols));
    }
  }

  addLine(padLine('Paid', formatLKR(bill.paid_cents), cols));
  addLine(padLine('Change', formatLKR(bill.change_cents), cols));

  // 11. Dashed line
  addDashed();

  // 12. Footer text from settings
  if (bill.shop.footer) {
    const footerLines = wrapText(bill.shop.footer, cols);
    for (const fl of footerLines) {
      addLine(centerText(fl, cols));
    }
  }

  // 13. 'Thank you, please come again'
  addLine(centerText('Thank you, please come again', cols));

  // 14. Code128 Barcode representation in text
  addLine(centerText(`*${bill.bill_no}*`, cols));

  // 15. DUPLICATE COPY at bottom when print_count >= 1
  if (isDuplicate) {
    addLine(centerText('*** DUPLICATE COPY ***', cols));
  }

  return out.join('\n');
}

