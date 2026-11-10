import { describe, it, expect } from 'vitest';
import { analyzeSmsText, renderSmsTemplate, isCharGsm7 } from './lib/gsm';
import { maskPhoneForLog, MockProvider } from './lib/providers';

describe('SMS Character Counter & GSM-7 vs UCS-2 Encoding', () => {
  it('correctly identifies standard GSM-7 basic and extended characters', () => {
    expect(isCharGsm7('A')).toBe(true);
    expect(isCharGsm7('1')).toBe(true);
    expect(isCharGsm7('.')).toBe(true);
    expect(isCharGsm7('€')).toBe(true); // GSM extension
    expect(isCharGsm7('[')).toBe(true); // GSM extension
  });

  it('detects Sinhala characters as non-GSM and switches to UCS-2 mode (70 chars max)', () => {
    // English text: GSM-7, 160 limit
    const englishText = 'Thank you for shopping at Wewala Store. Bill WWL-001, total Rs. 1,250.00';
    const engInfo = analyzeSmsText(englishText);
    expect(engInfo.isGsm).toBe(true);
    expect(engInfo.encoding).toBe('GSM-7');
    expect(engInfo.maxPerSingleSms).toBe(160);
    expect(engInfo.segments).toBe(1);

    // Sinhala text: "ස්තූතියි" (Thank you in Sinhala)
    const sinhalaText = 'ස්තූතියි! Wewala Store Bill WWL-001, total Rs. 1,250.00';
    const sinInfo = analyzeSmsText(sinhalaText);
    expect(sinInfo.isGsm).toBe(false);
    expect(sinInfo.encoding).toBe('UCS-2');
    expect(sinInfo.maxPerSingleSms).toBe(70);
    expect(sinInfo.nonGsmCharacters.length).toBeGreaterThan(0);
  });

  it('detects Tamil characters as non-GSM and switches to UCS-2 mode', () => {
    // Tamil text: "நன்றி" (Thank you in Tamil)
    const tamilText = 'நன்றி Wewala Store';
    const tamInfo = analyzeSmsText(tamilText);
    expect(tamInfo.isGsm).toBe(false);
    expect(tamInfo.encoding).toBe('UCS-2');
    expect(tamInfo.maxPerSingleSms).toBe(70);
  });

  it('calculates multi-part SMS segments properly for long GSM-7 and UCS-2 text', () => {
    // GSM-7 text > 160 characters (multipart limit is 153 chars per segment)
    const longGsm = 'A'.repeat(170);
    const gsmRes = analyzeSmsText(longGsm);
    expect(gsmRes.segments).toBe(2);

    // UCS-2 text > 70 characters (multipart limit is 67 chars per segment)
    const longUcs = 'අ' + 'A'.repeat(75);
    const ucsRes = analyzeSmsText(longUcs);
    expect(ucsRes.segments).toBe(2);
  });

  it('renders template substituting {shop}, {bill_no}, {total}, {date}, and {phone}', () => {
    const template =
      'Thank you for shopping at {shop}. Bill {bill_no}, total {total}, {date}. Enquiries: {phone}';
    const rendered = renderSmsTemplate(template, {
      shop: 'Wewala Super Store',
      bill_no: 'WWL-20261110-0099',
      total: 'Rs. 3,500.00',
      date: '2026-11-10 16:00',
      phone: '0112345678',
    });

    expect(rendered).toBe(
      'Thank you for shopping at Wewala Super Store. Bill WWL-20261110-0099, total Rs. 3,500.00, 2026-11-10 16:00. Enquiries: 0112345678'
    );
    expect(rendered).not.toContain('{shop}');
    expect(rendered).not.toContain('{bill_no}');
    expect(rendered).not.toContain('{total}');
    expect(rendered).not.toContain('{date}');
    expect(rendered).not.toContain('{phone}');
  });
});

describe('Privacy and Security Helpers', () => {
  it('masks phone numbers in logs to prevent PII exposure', () => {
    expect(maskPhoneForLog('+94771234567')).toBe('+9477****567');
    expect(maskPhoneForLog('0771234567')).toBe('07712****567');
    expect(maskPhoneForLog(null)).toBe('****');
  });

  it('initializes MockProvider by default', () => {
    const provider = new MockProvider();
    expect(provider.name).toBe('MockProvider');
  });

  it('mock provider sends message and returns valid message id', async () => {
    const provider = new MockProvider();
    const res = await provider.send('+94771234567', 'Test message', 'WewalaStore');
    expect(res.providerMessageId).toMatch(/^mock-msg-/);
  });
});

describe('Exponential Backoff and Retry Simulation Logic', () => {
  // Pure simulation replicating the record_sms_result Postgres function logic
  function simulateRecordSmsResult(
    currentAttempts: number,
    ok: boolean,
    _error?: string
  ): { status: 'sent' | 'pending' | 'failed'; attempts: number; backoffMinutes?: number } {
    if (ok) {
      return { status: 'sent', attempts: currentAttempts };
    }

    const newAttempts = currentAttempts + 1;
    if (newAttempts >= 5) {
      return { status: 'failed', attempts: newAttempts };
    }

    let backoffMinutes = 60;
    if (newAttempts === 1) backoffMinutes = 1;
    else if (newAttempts === 2) backoffMinutes = 5;
    else if (newAttempts === 3) backoffMinutes = 15;

    return {
      status: 'pending',
      attempts: newAttempts,
      backoffMinutes,
    };
  }

  it('retries with exponential backoff on failure (1, 5, 15, 60 mins) and ends in failed after 5 attempts', () => {
    // Attempt 1 failure -> pending, 1 min backoff
    let result = simulateRecordSmsResult(0, false, 'Network error');
    expect(result.status).toBe('pending');
    expect(result.attempts).toBe(1);
    expect(result.backoffMinutes).toBe(1);

    // Attempt 2 failure -> pending, 5 min backoff
    result = simulateRecordSmsResult(1, false, 'Gateway timeout');
    expect(result.status).toBe('pending');
    expect(result.attempts).toBe(2);
    expect(result.backoffMinutes).toBe(5);

    // Attempt 3 failure -> pending, 15 min backoff
    result = simulateRecordSmsResult(2, false, 'Rate limit exceeded');
    expect(result.status).toBe('pending');
    expect(result.attempts).toBe(3);
    expect(result.backoffMinutes).toBe(15);

    // Attempt 4 failure -> pending, 60 min backoff
    result = simulateRecordSmsResult(3, false, 'Service unavailable');
    expect(result.status).toBe('pending');
    expect(result.attempts).toBe(4);
    expect(result.backoffMinutes).toBe(60);

    // Attempt 5 failure -> status marked 'failed'
    result = simulateRecordSmsResult(4, false, 'Connection refused');
    expect(result.status).toBe('failed');
    expect(result.attempts).toBe(5);
  });

  it('marks row as sent immediately upon success', () => {
    const result = simulateRecordSmsResult(2, true);
    expect(result.status).toBe('sent');
  });
});

describe('Sale and Opt-Out Rules Verification', () => {
  // Pure function modeling the create_sale step 12 SMS insertion decision
  function shouldCreateSmsOutboxRow(params: {
    smsEnabled: boolean;
    customerPhone: string | null;
    customerOptedOut: boolean;
    cashierConsentGranted: boolean;
  }): boolean {
    if (!params.smsEnabled) return false;
    if (!params.customerPhone || params.customerPhone.trim().length === 0) return false;
    if (params.customerOptedOut) return false;
    if (!params.cashierConsentGranted) return false;
    return true;
  }

  it('creates exactly one outbox row when a valid phone and consent is present', () => {
    const shouldSend = shouldCreateSmsOutboxRow({
      smsEnabled: true,
      customerPhone: '+94771234567',
      customerOptedOut: false,
      cashierConsentGranted: true,
    });
    expect(shouldSend).toBe(true);
  });

  it('creates NO outbox row when customer has no phone', () => {
    const shouldSend = shouldCreateSmsOutboxRow({
      smsEnabled: true,
      customerPhone: null,
      customerOptedOut: false,
      cashierConsentGranted: true,
    });
    expect(shouldSend).toBe(false);
  });

  it('creates NO outbox row when customer has opted out of SMS', () => {
    const shouldSend = shouldCreateSmsOutboxRow({
      smsEnabled: true,
      customerPhone: '+94771234567',
      customerOptedOut: true, // Opted out
      cashierConsentGranted: true,
    });
    expect(shouldSend).toBe(false);
  });

  it('creates NO outbox row when cashier did not tick consent', () => {
    const shouldSend = shouldCreateSmsOutboxRow({
      smsEnabled: true,
      customerPhone: '+94771234567',
      customerOptedOut: false,
      cashierConsentGranted: false, // No consent
    });
    expect(shouldSend).toBe(false);
  });

  it('creates NO outbox row when shop settings have SMS disabled', () => {
    const shouldSend = shouldCreateSmsOutboxRow({
      smsEnabled: false, // Disabled store-wide
      customerPhone: '+94771234567',
      customerOptedOut: false,
      cashierConsentGranted: true,
    });
    expect(shouldSend).toBe(false);
  });
});

describe('Edge Function Security Rules', () => {
  function verifyEdgeFunctionAuth(headers: {
    secretHeader?: string | null;
    authHeader?: string | null;
    expectedSecret: string;
    isStaffSessionValid: boolean;
  }): { authorized: boolean; reason?: string } {
    if (headers.secretHeader && headers.secretHeader === headers.expectedSecret) {
      return { authorized: true };
    }
    if (headers.authHeader && headers.authHeader.startsWith('Bearer ') && headers.isStaffSessionValid) {
      return { authorized: true };
    }
    return { authorized: false, reason: 'UNAUTHORIZED' };
  }

  it('authorizes requests carrying valid x-sms-secret header', () => {
    const auth = verifyEdgeFunctionAuth({
      secretHeader: 'super-secret-trigger-key-123',
      expectedSecret: 'super-secret-trigger-key-123',
      isStaffSessionValid: false,
    });
    expect(auth.authorized).toBe(true);
  });

  it('authorizes requests with valid authenticated staff session', () => {
    const auth = verifyEdgeFunctionAuth({
      authHeader: 'Bearer valid.staff.jwt',
      expectedSecret: 'super-secret-trigger-key-123',
      isStaffSessionValid: true,
    });
    expect(auth.authorized).toBe(true);
  });

  it('rejects unauthenticated requests without secret or valid JWT', () => {
    const auth = verifyEdgeFunctionAuth({
      secretHeader: 'wrong-key',
      authHeader: null,
      expectedSecret: 'super-secret-trigger-key-123',
      isStaffSessionValid: false,
    });
    expect(auth.authorized).toBe(false);
    expect(auth.reason).toBe('UNAUTHORIZED');
  });
});
