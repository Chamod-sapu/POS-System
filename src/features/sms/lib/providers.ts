/**
 * SMS Provider Interface and Core Adapter Implementations
 */

export interface SmsProvider {
  name: string;
  send(toE164: string, message: string, senderId: string): Promise<{ providerMessageId: string }>;
}

/**
 * Masks phone numbers for secure, privacy-compliant logging.
 * Example: "+94771234567" -> "+9477****567"
 */
export function maskPhoneForLog(phone?: string | null): string {
  if (!phone) return '****';
  const clean = phone.trim();
  if (clean.length >= 7) {
    return `${clean.slice(0, 5)}****${clean.slice(-3)}`;
  }
  return '****';
}

/**
 * 1. Mock Provider (Default for development and automated test suites)
 */
export class MockProvider implements SmsProvider {
  public name = 'MockProvider';

  public async send(
    toE164: string,
    message: string,
    senderId: string
  ): Promise<{ providerMessageId: string }> {
    console.log(
      `[MockProvider] Dispatched SMS -> To: ${maskPhoneForLog(toE164)}, Sender: ${senderId}, Length: ${message.length} chars`
    );
    // Simulate brief network delay
    await new Promise((r) => setTimeout(r, 20));
    return { providerMessageId: `mock-msg-${Math.random().toString(36).slice(2, 11)}` };
  }
}

