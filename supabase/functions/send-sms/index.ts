// ==============================================================================
// Supabase Edge Function: send-sms
// Transactional SMS Delivery & Retry Gateway for Wewala POS
//
// Security Rules:
// 1. Accepts ONLY:
//    (a) Calls carrying the shared secret header ('x-sms-secret') matching SMS_TRIGGER_SECRET.
//    (b) Authenticated staff JWT with a valid profile requesting retry for a specific outbox_id.
// 2. NEVER accepts phone numbers or message text from the caller. Both are read
//    strictly from the database sms_outbox table to prevent unauthorized SMS relay.
// 3. Phone numbers and secrets are NEVER logged in full (masked as 077****123).
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") ?? "http://localhost:5173";

function getCorsHeaders(req: Request) {
  const reqOrigin = req.headers.get("Origin") || req.headers.get("origin") || "";
  const origin = (reqOrigin === allowedOrigin || reqOrigin.startsWith("http://localhost:"))
    ? reqOrigin
    : allowedOrigin;

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sms-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

/**
 * Masks phone numbers for secure, privacy-compliant logging.
 * Example: "+94771234567" -> "+9477****567"
 */
export function maskPhoneForLog(phone?: string | null): string {
  if (!phone) return "****";
  const clean = phone.trim();
  if (clean.length >= 7) {
    return `${clean.slice(0, 5)}****${clean.slice(-3)}`;
  }
  return "****";
}

/**
 * Common SMS Provider Interface
 */
export interface SmsProvider {
  name: string;
  send(toE164: string, message: string, senderId: string): Promise<{ providerMessageId: string }>;
}

// ---------------------------------------------------------------------------
// Provider Adapters
// ---------------------------------------------------------------------------

/**
 * 1. Mock Provider (Default for development & tests)
 */
export class MockProvider implements SmsProvider {
  public name = "MockProvider";

  public async send(toE164: string, message: string, senderId: string): Promise<{ providerMessageId: string }> {
    console.log(
      `[MockProvider] Dispatched SMS -> To: ${maskPhoneForLog(toE164)}, Sender: ${senderId}, Length: ${message.length} chars`
    );
    // Simulate short network delay
    await new Promise((r) => setTimeout(r, 50));
    return { providerMessageId: `mock-msg-${crypto.randomUUID()}` };
  }
}

/**
 * 2. Notify.lk Provider (Sri Lankan SMS Gateway API)
 * Documentation: https://app.notify.lk/api/v1/send
 */
export class NotifyLkProvider implements SmsProvider {
  public name = "NotifyLkProvider";

  constructor(
    private userId: string,
    private apiKey: string,
    private apiUrl: string = "https://app.notify.lk/api/v1/send"
  ) {}

  public async send(toE164: string, message: string, senderId: string): Promise<{ providerMessageId: string }> {
    // Notify.lk expects phone in format 9477xxxxxxx (without +) or 077xxxxxxx
    let toFormatted = toE164.replace(/\D/g, "");
    if (toFormatted.startsWith("0")) {
      toFormatted = "94" + toFormatted.slice(1);
    }

    const payload = {
      user_id: this.userId,
      api_key: this.apiKey,
      sender_id: senderId,
      to: toFormatted,
      message: message,
    };

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const resJson = await response.json().catch(() => ({}));
    if (!response.ok || resJson.status === "error") {
      throw new Error(`Notify.lk error: ${resJson.message || response.statusText}`);
    }

    return { providerMessageId: String(resJson.data?.message_id || resJson.message_id || crypto.randomUUID()) };
  }
}

/**
 * 3. Dialog eSMS Provider (Dialog Axiata Sri Lanka REST Gateway)
 */
export class DialogEsmsProvider implements SmsProvider {
  public name = "DialogEsmsProvider";

  constructor(
    private apiKey: string,
    private apiUrl: string = "https://esms.dialog.lk/api/v1/sms/send"
  ) {}

  public async send(toE164: string, message: string, senderId: string): Promise<{ providerMessageId: string }> {
    // Dialog eSMS expects format 9477xxxxxxx
    let msisdn = toE164.replace(/\D/g, "");
    if (msisdn.startsWith("0")) {
      msisdn = "94" + msisdn.slice(1);
    }

    const payload = {
      sourceAddress: senderId,
      message: message,
      transactionId: `WWL-${Date.now()}`,
      paymentMethod: 0,
      msisdn: [{ mobile: msisdn }],
    };

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const resJson = await response.json().catch(() => ({}));
    if (!response.ok || resJson.error) {
      throw new Error(`Dialog eSMS error: ${resJson.error_description || resJson.message || response.statusText}`);
    }

    return { providerMessageId: String(resJson.transactionId || crypto.randomUUID()) };
  }
}

/**
 * 4. Mobitel mBizz Bulk SMS Provider (Mobitel Sri Lanka)
 */
export class MobitelBulkProvider implements SmsProvider {
  public name = "MobitelBulkProvider";

  constructor(
    private username: string,
    private password: string,
    private apiUrl: string = "https://msms.mobitel.lk/mBizz/services/sms/send"
  ) {}

  public async send(toE164: string, message: string, senderId: string): Promise<{ providerMessageId: string }> {
    // Mobitel expects format 9477xxxxxxx
    let dest = toE164.replace(/\D/g, "");
    if (dest.startsWith("0")) {
      dest = "94" + dest.slice(1);
    }

    const payload = {
      username: this.username,
      password: this.password,
      serviceId: senderId,
      destinationNumber: dest,
      message: message,
    };

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const resJson = await response.json().catch(() => ({}));
    if (!response.ok || resJson.status === "FAILED") {
      throw new Error(`Mobitel mBizz error: ${resJson.errorDescription || response.statusText}`);
    }

    return { providerMessageId: String(resJson.messageId || crypto.randomUUID()) };
  }
}

/**
 * 5. Generic HTTP / REST Provider
 */
export class GenericRestProvider implements SmsProvider {
  public name = "GenericRestProvider";

  constructor(
    private apiUrl: string,
    private apiKey?: string
  ) {}

  public async send(toE164: string, message: string, senderId: string): Promise<{ providerMessageId: string }> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        to: toE164,
        message,
        sender_id: senderId,
      }),
    });

    const resJson = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Generic SMS error: ${resJson.error || response.statusText}`);
    }

    return { providerMessageId: String(resJson.id || resJson.message_id || crypto.randomUUID()) };
  }
}

/**
 * Factory that selects and initializes the configured SMS Provider
 */
export function getSmsProvider(): SmsProvider {
  const providerType = (Deno.env.get("SMS_PROVIDER") ?? "mock").toLowerCase();
  const apiUrl = Deno.env.get("SMS_API_URL");
  const apiKey = Deno.env.get("SMS_API_KEY") ?? "";
  const username = Deno.env.get("SMS_USERNAME") ?? "";
  const password = Deno.env.get("SMS_PASSWORD") ?? "";
  const userId = Deno.env.get("SMS_USER_ID") ?? "";

  switch (providerType) {
    case "notifylk":
      return new NotifyLkProvider(userId, apiKey, apiUrl ?? undefined);
    case "dialog":
      return new DialogEsmsProvider(apiKey, apiUrl ?? undefined);
    case "mobitel":
      return new MobitelBulkProvider(username, password, apiUrl ?? undefined);
    case "generic":
      if (!apiUrl) throw new Error("SMS_API_URL is required for generic provider");
      return new GenericRestProvider(apiUrl, apiKey);
    case "mock":
    default:
      return new MockProvider();
  }
}

// ---------------------------------------------------------------------------
// HTTP Request Handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const triggerSecret = Deno.env.get("SMS_TRIGGER_SECRET") ?? "";
    const senderId = Deno.env.get("SMS_SENDER_ID") ?? "WewalaStore";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "CONFIG_ERROR", message: "Missing Supabase server configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // -------------------------------------------------------------------------
    // 1. SECURITY & AUTHENTICATION CHECK
    // -------------------------------------------------------------------------
    const secretHeader = req.headers.get("x-sms-secret");
    const authHeader = req.headers.get("authorization");

    let isAuthorized = false;
    let isStaffRetry = false;
    let targetOutboxId: string | null = null;

    // Check (a): Shared Secret from pg_net trigger or pg_cron
    if (triggerSecret && secretHeader && secretHeader === triggerSecret) {
      isAuthorized = true;
    }

    // Check (b): Authenticated Staff JWT with valid role
    if (!isAuthorized && authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authErr } = await adminClient.auth.getUser(token);

      if (!authErr && user) {
        const { data: profile } = await adminClient
          .from("profiles")
          .select("role, is_active")
          .eq("id", user.id)
          .single();

        if (profile && profile.is_active && (profile.role === "owner" || profile.role === "manager" || profile.role === "cashier")) {
          isAuthorized = true;
          isStaffRetry = true;
        }
      }
    }

    if (!isAuthorized) {
      console.warn("[send-sms] Unauthorized access attempt blocked");
      return new Response(
        JSON.stringify({
          error: "UNAUTHORIZED",
          message: "Request must carry valid x-sms-secret or authenticated staff session",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse optional body parameters (only outbox_id is respected from client)
    let bodyJson: { outbox_id?: string } = {};
    try {
      bodyJson = await req.json();
      if (bodyJson.outbox_id) {
        targetOutboxId = bodyJson.outbox_id;
      }
    } catch {
      // Empty or no body is valid for cron calls
    }

    const provider = getSmsProvider();
    const results: Array<{ id: string; status: string; error?: string }> = [];

    // -------------------------------------------------------------------------
    // 2. DISPATCH PROCESSING
    // -------------------------------------------------------------------------

    // CASE A: Targeted single-row retry requested by staff
    if (isStaffRetry && targetOutboxId) {
      const { data: row, error: fetchErr } = await adminClient
        .from("sms_outbox")
        .select("id, phone, message, attempts")
        .eq("id", targetOutboxId)
        .single();

      if (fetchErr || !row) {
        return new Response(
          JSON.stringify({ error: "NOT_FOUND", message: "Specified SMS record does not exist" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Mark sending
      await adminClient.from("sms_outbox").update({ status: "sending" }).eq("id", row.id);

      try {
        const sendRes = await provider.send(row.phone, row.message, senderId);
        await adminClient.rpc("record_sms_result", {
          p_id: row.id,
          p_ok: true,
          p_provider_id: sendRes.providerMessageId,
        });
        results.push({ id: row.id, status: "sent" });
      } catch (sendErr) {
        const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
        await adminClient.rpc("record_sms_result", {
          p_id: row.id,
          p_ok: false,
          p_error: errMsg,
        });
        results.push({ id: row.id, status: "failed", error: errMsg });
      }

      return new Response(
        JSON.stringify({ success: true, processed: 1, results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // CASE B: Batch Claim (Trigger or Cron execution)
    const { data: batch, error: claimErr } = await adminClient.rpc("claim_sms_batch", {
      p_limit: 20,
    });

    if (claimErr) {
      console.error("[send-sms] Batch claim error:", claimErr);
      return new Response(
        JSON.stringify({ error: "CLAIM_ERROR", message: claimErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const messages = batch || [];
    console.log(`[send-sms] Claimed ${messages.length} pending SMS records for dispatch`);

    for (const msg of messages) {
      try {
        const sendRes = await provider.send(msg.phone, msg.message, senderId);
        await adminClient.rpc("record_sms_result", {
          p_id: msg.id,
          p_ok: true,
          p_provider_id: sendRes.providerMessageId,
        });
        results.push({ id: msg.id, status: "sent" });
      } catch (sendErr) {
        const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
        console.warn(`[send-sms] Delivery failed for ${maskPhoneForLog(msg.phone)}: ${errMsg}`);
        await adminClient.rpc("record_sms_result", {
          p_id: msg.id,
          p_ok: false,
          p_error: errMsg,
        });
        results.push({ id: msg.id, status: "failed", error: errMsg });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        provider: provider.name,
        processed: messages.length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (globalErr) {
    const msg = globalErr instanceof Error ? globalErr.message : String(globalErr);
    console.error("[send-sms] Unhandled exception:", msg);
    return new Response(
      JSON.stringify({ error: "INTERNAL_ERROR", message: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

