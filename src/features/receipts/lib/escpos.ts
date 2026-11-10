import { Bill, PaperWidth } from '../types';
import { formatReceiptPlainText } from './formatPlainText';

/**
 * TypeScript ESC/POS Command Byte Builder
 */
export class EscPosEncoder {
  private buffer: number[] = [];

  constructor() {
    this.init();
  }

  public init(): this {
    // ESC @ (Initialize printer)
    this.buffer.push(0x1b, 0x40);
    return this;
  }

  public alignLeft(): this {
    // ESC a 0
    this.buffer.push(0x1b, 0x61, 0x00);
    return this;
  }

  public alignCenter(): this {
    // ESC a 1
    this.buffer.push(0x1b, 0x61, 0x01);
    return this;
  }

  public alignRight(): this {
    // ESC a 2
    this.buffer.push(0x1b, 0x61, 0x02);
    return this;
  }

  public bold(enabled: boolean): this {
    // ESC E n
    this.buffer.push(0x1b, 0x45, enabled ? 0x01 : 0x00);
    return this;
  }

  public doubleHeight(enabled: boolean): this {
    // GS ! n (Double height: 0x01, Normal: 0x00)
    this.buffer.push(0x1d, 0x21, enabled ? 0x01 : 0x00);
    return this;
  }

  public doubleSize(enabled: boolean): this {
    // GS ! n (Double width & height: 0x11, Normal: 0x00)
    this.buffer.push(0x1d, 0x21, enabled ? 0x11 : 0x00);
    return this;
  }

  public text(str: string): this {
    // Convert ASCII/Latin1 string to byte array
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      this.buffer.push(code > 255 ? 0x3f : code); // replace non-ASCII with '?'
    }
    return this;
  }

  public lineFeed(count: number = 1): this {
    for (let i = 0; i < count; i++) {
      this.buffer.push(0x0a);
    }
    return this;
  }

  public feedAndCut(): this {
    // Feed 3 lines, then GS V 66 0 (partial cut)
    this.lineFeed(3);
    this.buffer.push(0x1d, 0x56, 0x42, 0x00);
    return this;
  }

  public cashDrawerPulse(): this {
    // ESC p 0 25 250 (Connector pin 2, t1=50ms, t2=500ms)
    this.buffer.push(0x1b, 0x70, 0x00, 0x19, 0xfa);
    return this;
  }

  /**
   * Code128 Barcode in ESC/POS: GS k 73 n [subset B prefix] [text]
   */
  public barcodeCode128(text: string): this {
    // Center barcode
    this.alignCenter();
    // GS h 50 (barcode height: 50 dots)
    this.buffer.push(0x1d, 0x68, 50);
    // GS w 2 (barcode module width 2)
    this.buffer.push(0x1d, 0x77, 2);
    // GS H 2 (print HRI characters below barcode)
    this.buffer.push(0x1d, 0x48, 2);

    // Code128 format: GS k 73 len {B text
    const cleanText = text.trim();
    // {B corresponds to Code 128 subset B: 0x7B, 0x42
    const len = cleanText.length + 2;
    this.buffer.push(0x1d, 0x6b, 73, len, 0x7b, 0x42);

    for (let i = 0; i < cleanText.length; i++) {
      this.buffer.push(cleanText.charCodeAt(i));
    }

    this.lineFeed(1);
    this.alignLeft();
    return this;
  }

  public toUint8Array(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Returns the raw ESC/POS byte sequence to pop the cash drawer.
 */
export function getCashDrawerPulseBytes(): Uint8Array {
  const encoder = new EscPosEncoder();
  encoder.cashDrawerPulse();
  return encoder.toUint8Array();
}

/**
 * Encodes a complete Bill into ESC/POS binary format.
 */
export function encodeBillToEscPos(
  bill: Bill,
  paperWidth: PaperWidth,
  options?: { triggerDrawer?: boolean }
): Uint8Array {
  const encoder = new EscPosEncoder();

  // If cash checkout and drawer trigger enabled, kick cash drawer
  const hasCash = bill.payments?.some((p) => p.method === 'cash');
  if (options?.triggerDrawer && hasCash) {
    encoder.cashDrawerPulse();
  }

  // Format the bill text with exact width constraints
  const plainText = formatReceiptPlainText(bill, paperWidth);
  const lines = plainText.split('\n');

  for (const line of lines) {
    // Check if line needs emphasis or centering
    if (line.includes('*** DUPLICATE COPY ***')) {
      encoder.alignCenter().bold(true).text(line).bold(false).lineFeed();
    } else if (line.startsWith('TOTAL')) {
      encoder.alignLeft().bold(true).doubleHeight(true).text(line).doubleHeight(false).bold(false).lineFeed();
    } else if (line.startsWith('*WWL-')) {
      // Barcode line
      encoder.barcodeCode128(bill.bill_no);
    } else {
      encoder.text(line).lineFeed();
    }
  }

  // Final feed and cut
  encoder.feedAndCut();

  return encoder.toUint8Array();
}

/**
 * Sends raw bytes to a connected thermal printer via Web Serial API.
 */
export async function sendBytesViaWebSerial(bytes: Uint8Array): Promise<boolean> {
  const nav = navigator as unknown as { serial?: { requestPort: () => Promise<unknown> } };
  if (!nav.serial) {
    throw new Error('Web Serial API is not supported in this browser.');
  }

  const port = (await nav.serial.requestPort()) as {
    open: (options: { baudRate: number }) => Promise<void>;
    writable?: { getWriter: () => { write: (data: Uint8Array) => Promise<void>; releaseLock: () => void } };
    close: () => Promise<void>;
  };

  await port.open({ baudRate: 9600 });
  if (!port.writable) {
    throw new Error('Serial port is not writable.');
  }

  const writer = port.writable.getWriter();
  try {
    await writer.write(bytes);
  } finally {
    writer.releaseLock();
    await port.close();
  }

  return true;
}

/**
 * Sends raw bytes to a connected thermal printer via WebUSB API.
 */
export async function sendBytesViaWebUsb(bytes: Uint8Array): Promise<boolean> {
  const nav = navigator as unknown as { usb?: { requestDevice: (filters: { filters: unknown[] }) => Promise<unknown> } };
  if (!nav.usb) {
    throw new Error('WebUSB API is not supported in this browser.');
  }

  const device = (await nav.usb.requestDevice({ filters: [] })) as {
    open: () => Promise<void>;
    selectConfiguration: (config: number) => Promise<void>;
    claimInterface: (iface: number) => Promise<void>;
    transferOut: (endpoint: number, data: Uint8Array) => Promise<unknown>;
    close: () => Promise<void>;
    configuration?: { interfaces: Array<{ interfaceNumber: number; alternates: Array<{ endpoints: Array<{ direction: string; endpointNumber: number }> }> }> };
  };

  await device.open();
  await device.selectConfiguration(1);

  let endpointNumber = 1;
  const iface = device.configuration?.interfaces[0];
  if (iface) {
    await device.claimInterface(iface.interfaceNumber);
    const outEndpoint = iface.alternates[0]?.endpoints.find((ep) => ep.direction === 'out');
    if (outEndpoint) {
      endpointNumber = outEndpoint.endpointNumber;
    }
  }

  try {
    await device.transferOut(endpointNumber, bytes);
  } finally {
    await device.close();
  }

  return true;
}

