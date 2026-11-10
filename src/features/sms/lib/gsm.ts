/**
 * GSM-7 and UCS-2 Character Encoding Analysis & SMS Segment Calculation for Sri Lanka.
 *
 * Rules:
 * - GSM-7 Standard 7-bit charset: 160 chars per SMS segment (153 chars for multi-part).
 * - UCS-2 16-bit Unicode (Sinhala \u0D80-\u0DFF, Tamil \u0B80-\u0BFF, emojis):
 *   Drops the limit to 70 chars per SMS segment (67 chars for multi-part).
 */

// GSM 03.38 Basic Character Set
const GSM_BASIC_CHARS =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

// GSM 03.38 Extension Set (Escape + Character: counts as 2 chars in GSM-7)
const GSM_EXTENSION_CHARS = "|^€{}[]~\\";

export interface SmsEncodingInfo {
  charCount: number;
  isGsm: boolean;
  encoding: 'GSM-7' | 'UCS-2';
  maxPerSingleSms: number;
  maxPerMultipartSms: number;
  segments: number;
  remainingInCurrentSegment: number;
  nonGsmCharacters: string[];
}

/**
 * Checks whether a single character is within the GSM-7 basic or extended alphabet.
 */
export function isCharGsm7(char: string): boolean {
  return GSM_BASIC_CHARS.includes(char) || GSM_EXTENSION_CHARS.includes(char);
}

/**
 * Inspects a text string and calculates GSM-7 vs UCS-2 encoding properties,
 * detecting any Sinhala, Tamil, or Unicode characters that trigger 70-char UCS-2 limits.
 */
export function analyzeSmsText(text: string): SmsEncodingInfo {
  if (!text) {
    return {
      charCount: 0,
      isGsm: true,
      encoding: 'GSM-7',
      maxPerSingleSms: 160,
      maxPerMultipartSms: 153,
      segments: 0,
      remainingInCurrentSegment: 160,
      nonGsmCharacters: [],
    };
  }

  const nonGsmChars: string[] = [];
  let gsmUnits = 0;

  for (const char of text) {
    if (GSM_BASIC_CHARS.includes(char)) {
      gsmUnits += 1;
    } else if (GSM_EXTENSION_CHARS.includes(char)) {
      gsmUnits += 2; // extension chars take 2 Septets
    } else {
      if (!nonGsmChars.includes(char)) {
        nonGsmChars.push(char);
      }
    }
  }

  const isGsm = nonGsmChars.length === 0;

  if (isGsm) {
    const totalChars = gsmUnits;
    let segments = 1;
    let remaining = 160 - totalChars;

    if (totalChars > 160) {
      segments = Math.ceil(totalChars / 153);
      remaining = segments * 153 - totalChars;
    }

    return {
      charCount: totalChars,
      isGsm: true,
      encoding: 'GSM-7',
      maxPerSingleSms: 160,
      maxPerMultipartSms: 153,
      segments,
      remainingInCurrentSegment: Math.max(0, remaining),
      nonGsmCharacters: [],
    };
  }

  // UCS-2 (Unicode) Mode: applies to Sinhala, Tamil, and Special Unicode
  const totalChars = Array.from(text).length; // Proper unicode glyph length
  let segments = 1;
  let remaining = 70 - totalChars;

  if (totalChars > 70) {
    segments = Math.ceil(totalChars / 67);
    remaining = segments * 67 - totalChars;
  }

  return {
    charCount: totalChars,
    isGsm: false,
    encoding: 'UCS-2',
    maxPerSingleSms: 70,
    maxPerMultipartSms: 67,
    segments,
    remainingInCurrentSegment: Math.max(0, remaining),
    nonGsmCharacters: nonGsmChars,
  };
}

/**
 * Replaces placeholders in the SMS template with live sale values.
 * Placeholders: {shop}, {bill_no}, {total}, {date}, {phone} (and {shop_name})
 */
export function renderSmsTemplate(
  template: string,
  vars: {
    shop?: string;
    bill_no?: string;
    total?: string;
    date?: string;
    phone?: string;
  }
): string {
  if (!template) return '';

  const shopName = vars.shop || 'Wewala Store';
  const billNo = vars.bill_no || 'WWL-20261110-0001';
  const total = vars.total || 'Rs. 1,250.00';
  const date = vars.date || '2026-11-10 14:35';
  const phone = vars.phone || '0112345678';

  return template
    .replace(/\{shop_name\}/g, shopName)
    .replace(/\{shop\}/g, shopName)
    .replace(/\{bill_no\}/g, billNo)
    .replace(/\{total\}/g, total)
    .replace(/\{date\}/g, date)
    .replace(/\{phone\}/g, phone);
}

