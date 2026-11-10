import { Bill, PrinterAdapter, PrintOptions, PaperWidth } from '../types';
import { getPrinterSettings } from './printerSettings';
import { verifyBill, logBillIntegrityFailure } from './verifyBill';
import { formatLKR } from '../../../lib/money';
import { maskPhoneNumber } from './maskPhone';
import { formatReceiptDate } from './formatPlainText';
import { generateCode128Svg } from './barcode';
import {
  encodeBillToEscPos,
  getCashDrawerPulseBytes,
  sendBytesViaWebSerial,
  sendBytesViaWebUsb,
} from './escpos';

/**
 * Builds pure HTML for thermal receipt rendering inside an isolated iframe or webview.
 */
export function buildThermalReceiptHtml(bill: Bill, paperWidth: PaperWidth): string {
  const printableWidth = paperWidth === '58mm' ? '48mm' : '72mm';
  const isDuplicate = Boolean(bill.is_duplicate || bill.print_count >= 1);
  const barcodeSvg = generateCode128Svg(bill.bill_no, {
    height: 35,
    barWidth: paperWidth === '58mm' ? 1.0 : 1.3,
    showText: true,
  });

  const linesHtml = bill.lines
    .map((line) => {
      const formattedQty = Number.isInteger(line.quantity)
        ? `${line.quantity}`
        : `${line.quantity.toFixed(3).replace(/\.?0+$/, '')}`;

      const discountHtml =
        line.line_discount_cents > 0
          ? `<div class="row text-muted"><span>  Discount</span><span>-${formatLKR(
              line.line_discount_cents
            )}</span></div>`
          : '';

      return `
      <div class="item-block">
        <div class="item-name">${escapeHtml(line.name)}</div>
        <div class="row">
          <span>${formattedQty} ${escapeHtml(line.unit)} x ${formatLKR(line.unit_price_cents)}</span>
          <span class="text-right font-bold">${formatLKR(line.line_total_cents)}</span>
        </div>
        ${discountHtml}
      </div>
    `;
    })
    .join('');

  const paymentsHtml = (bill.payments || [])
    .map((p) => {
      const methodLabel = p.method.toUpperCase().replace('_', ' ');
      const refStr = p.reference ? ` (${escapeHtml(p.reference)})` : '';
      return `
      <div class="row">
        <span>  ${methodLabel}${refStr}</span>
        <span class="text-right">${formatLKR(p.amount_cents)}</span>
      </div>
    `;
    })
    .join('');

  let taxHtml = '';
  if (bill.tax) {
    const modeStr = bill.tax.mode === 'inclusive' ? 'incl.' : 'excl.';
    taxHtml = `
      <div class="row">
        <span>Tax (${bill.tax.rate_percent}% ${modeStr})</span>
        <span class="text-right">${formatLKR(bill.tax.tax_cents)}</span>
      </div>
    `;
  }

  let customerHtml = '';
  if (bill.customer) {
    const masked = maskPhoneNumber(bill.customer.phone);
    let label = '';
    if (bill.customer.name && masked) {
      label = `${escapeHtml(bill.customer.name)} (${masked})`;
    } else if (masked) {
      label = masked;
    } else if (bill.customer.name) {
      label = escapeHtml(bill.customer.name);
    }
    if (label) {
      customerHtml = `
        <div class="row">
          <span>Customer:</span>
          <span class="text-right">${label}</span>
        </div>
      `;
    }
  }

  return `
    <div class="thermal-receipt" style="width: ${printableWidth}; margin: 0 auto; font-family: 'Courier New', Courier, monospace; font-size: 11px; line-height: 1.25; color: #000; background: #fff;">
      ${
        isDuplicate
          ? `<div style="text-align: center; font-weight: bold; border-bottom: 1px dashed #000; padding-bottom: 3px; margin-bottom: 5px;">*** DUPLICATE COPY ***</div>`
          : ''
      }
      
      <div style="text-align: center;">
        <div style="font-size: 14px; font-weight: 900; text-transform: uppercase;">${escapeHtml(
          bill.shop.name || 'Wewala Store'
        )}</div>
        ${
          bill.shop.address
            ? `<div style="font-size: 10px;">${escapeHtml(bill.shop.address)}</div>`
            : ''
        }
        ${
          bill.shop.phone
            ? `<div style="font-size: 10px;">Tel: ${escapeHtml(bill.shop.phone)}</div>`
            : ''
        }
        ${
          bill.shop.vat_reg_no
            ? `<div style="font-size: 10px;">VAT Reg: ${escapeHtml(bill.shop.vat_reg_no)}</div>`
            : ''
        }
      </div>

      <div class="dashed-divider">------------------------------------------</div>

      <div class="meta-section">
        <div class="row"><span>Bill No:</span><span class="font-bold">${escapeHtml(
          bill.bill_no
        )}</span></div>
        <div class="row"><span>Date:</span><span>${formatReceiptDate(
          bill.date_time
        )}</span></div>
        <div class="row"><span>Cashier:</span><span>${escapeHtml(
          bill.cashier?.name || 'Cashier'
        )}</span></div>
        ${customerHtml}
      </div>

      <div class="dashed-divider">------------------------------------------</div>

      <div class="headers-row font-bold">
        <span>Item</span>
        <span class="text-right">Qty x Price / Total</span>
      </div>

      <div class="items-list">
        ${linesHtml}
      </div>

      <div class="dashed-divider">------------------------------------------</div>

      <div class="summary-section">
        <div class="row"><span>Subtotal</span><span class="text-right">${formatLKR(
          bill.subtotal_cents
        )}</span></div>
        ${
          bill.line_discount_cents > 0
            ? `<div class="row"><span>Item Discounts</span><span class="text-right">-${formatLKR(
                bill.line_discount_cents
              )}</span></div>`
            : ''
        }
        ${
          bill.bill_discount_cents > 0
            ? `<div class="row"><span>Bill Discount</span><span class="text-right">-${formatLKR(
                bill.bill_discount_cents
              )}</span></div>`
            : ''
        }
        ${taxHtml}
        <div class="row total-row font-bold" style="font-size: 14px; margin-top: 3px; padding-top: 2px; border-top: 1px solid #000;">
          <span>TOTAL</span>
          <span class="text-right">${formatLKR(bill.total_cents)}</span>
        </div>
      </div>

      <div class="payments-section" style="margin-top: 4px;">
        ${paymentsHtml}
        <div class="row font-bold"><span>Paid</span><span class="text-right">${formatLKR(
          bill.paid_cents
        )}</span></div>
        <div class="row font-bold"><span>Change</span><span class="text-right">${formatLKR(
          bill.change_cents
        )}</span></div>
      </div>

      <div class="dashed-divider">------------------------------------------</div>

      <div class="footer-section" style="text-align: center; font-size: 10px;">
        ${
          bill.shop.footer
            ? `<div style="margin-bottom: 4px;">${escapeHtml(bill.shop.footer)}</div>`
            : ''
        }
        <div style="font-weight: bold; margin-bottom: 6px;">Thank you, please come again</div>
        <div class="barcode-wrapper" style="margin: 4px 0;">
          ${barcodeSvg}
        </div>
      </div>

      ${
        isDuplicate
          ? `<div style="text-align: center; font-weight: bold; border-top: 1px dashed #000; padding-top: 3px; margin-top: 5px;">*** DUPLICATE COPY ***</div>`
          : ''
      }

      <div style="height: 10mm;"></div>
    </div>
  `;
}

function escapeHtml(str?: string | null): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Standard Browser Iframe Print Adapter (Default)
 */
export class BrowserPrintAdapter implements PrinterAdapter {
  public name = 'BrowserPrintAdapter';

  public async print(bill: Bill, options?: PrintOptions): Promise<void> {
    const settings = getPrinterSettings();
    const paperWidth = options?.paperWidth ?? settings.paperWidth;
    const copies = options?.copies ?? settings.copies;

    // 1. Strict Bill Integrity Check
    const check = verifyBill(bill);
    if (!check.valid) {
      const err = check.error || 'Bill totals mismatch, do not hand to customer';
      await logBillIntegrityFailure(bill, err);
      throw new Error(err);
    }

    if (typeof window === 'undefined') {
      return;
    }

    // 2. Build HTML receipt representation
    const receiptHtml = buildThermalReceiptHtml(bill, paperWidth);
    const copiesHtml =
      copies === 2
        ? `
        <div class="receipt-copy">${receiptHtml}</div>
        <div style="text-align: center; margin: 15px 0; border-top: 1px dashed #999; padding-top: 5px; font-size: 9px; font-family: monospace;">--- CUT HERE / MERCHANT COPY ---</div>
        <div class="receipt-copy">${receiptHtml}</div>
      `
        : `<div class="receipt-copy">${receiptHtml}</div>`;

    const fullDoc = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Receipt - ${bill.bill_no}</title>
          <style>
            @page {
              size: ${paperWidth} auto;
              margin: 0;
            }
            @media print {
              html, body {
                width: 100%;
                margin: 0;
                padding: 0;
                background: #fff;
              }
            }
            body {
              margin: 0;
              padding: 0;
              background: #fff;
              font-family: 'Courier New', Courier, monospace;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .row {
              display: flex;
              justify-content: space-between;
              align-items: baseline;
              width: 100%;
            }
            .text-right {
              text-align: right;
            }
            .font-bold {
              font-weight: bold;
            }
            .text-muted {
              color: #444;
              font-size: 10px;
            }
            .dashed-divider {
              text-align: center;
              overflow: hidden;
              white-space: nowrap;
              letter-spacing: -1px;
              margin: 3px 0;
              font-weight: bold;
            }
            .item-block {
              margin-bottom: 2px;
            }
            .item-name {
              word-break: break-word;
            }
          </style>
        </head>
        <body>
          ${copiesHtml}
        </body>
      </html>
    `;

    // 3. Inject into hidden iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';

    document.body.appendChild(iframe);

    return new Promise<void>((resolve, reject) => {
      const doc = iframe.contentWindow?.document;
      if (!doc) {
        document.body.removeChild(iframe);
        reject(new Error('Could not access print iframe document.'));
        return;
      }

      doc.open();
      doc.write(fullDoc);
      doc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          resolve();
        } catch (err) {
          reject(err);
        } finally {
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 1000);
        }
      }, 250);
    });
  }

  public async openCashDrawer(): Promise<void> {
    // In standard browser printing, cash drawers trigger automatically through printer drivers
    console.info('Cash drawer open request via printer driver triggered.');
  }
}

/**
 * Direct ESC/POS Thermal Printer Adapter (Web Serial / WebUSB with fallback to Browser)
 */
export class EscPosAdapter implements PrinterAdapter {
  public name = 'EscPosAdapter';
  private browserFallback = new BrowserPrintAdapter();

  public async print(bill: Bill, options?: PrintOptions): Promise<void> {
    const settings = getPrinterSettings();
    const paperWidth = options?.paperWidth ?? settings.paperWidth;
    const copies = options?.copies ?? settings.copies;
    const triggerDrawer = options?.openDrawer ?? settings.drawerOnCash;

    // 1. Strict Bill Integrity Check
    const check = verifyBill(bill);
    if (!check.valid) {
      const err = check.error || 'Bill totals mismatch, do not hand to customer';
      await logBillIntegrityFailure(bill, err);
      throw new Error(err);
    }

    const escPosBytes = encodeBillToEscPos(bill, paperWidth, { triggerDrawer });

    // Try Web Serial first, then WebUSB, then fallback to Browser Adapter
    try {
      if (typeof navigator !== 'undefined' && 'serial' in navigator) {
        for (let i = 0; i < copies; i++) {
          await sendBytesViaWebSerial(escPosBytes);
        }
        return;
      }
    } catch (serialErr) {
      console.warn('Web Serial printing failed or cancelled, attempting WebUSB:', serialErr);
    }

    try {
      if (typeof navigator !== 'undefined' && 'usb' in navigator) {
        for (let i = 0; i < copies; i++) {
          await sendBytesViaWebUsb(escPosBytes);
        }
        return;
      }
    } catch (usbErr) {
      console.warn('WebUSB printing failed or cancelled, falling back to Browser print:', usbErr);
    }

    // Graceful automatic fallback to standard Browser Adapter
    return this.browserFallback.print(bill, options);
  }

  public async openCashDrawer(): Promise<void> {
    const pulseBytes = getCashDrawerPulseBytes();
    try {
      if (typeof navigator !== 'undefined' && 'serial' in navigator) {
        await sendBytesViaWebSerial(pulseBytes);
        return;
      }
    } catch {
      // Continue to try USB
    }

    try {
      if (typeof navigator !== 'undefined' && 'usb' in navigator) {
        await sendBytesViaWebUsb(pulseBytes);
        return;
      }
    } catch {
      // Ignore
    }

    await this.browserFallback.openCashDrawer();
  }
}

/**
 * Printer Adapter Factory
 */
export function getPrinterAdapter(settings?: { adapter?: 'browser' | 'escpos' }): PrinterAdapter {
  const current = settings?.adapter ?? getPrinterSettings().adapter;
  if (current === 'escpos') {
    return new EscPosAdapter();
  }
  return new BrowserPrintAdapter();
}

/**
 * Universal printBill helper with error catching and result status
 */
export async function printBill(
  bill: Bill,
  options?: PrintOptions
): Promise<{ success: boolean; error?: string }> {
  try {
    const adapter = getPrinterAdapter();
    await adapter.print(bill, options);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

