import { supabase } from '../../../lib/supabase';

export type SmsStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';

export interface SmsOutboxRow {
  id: string;
  sale_id: string | null;
  bill_no?: string | null;
  phone: string;
  message: string;
  status: SmsStatus;
  attempts: number;
  last_error: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
  next_attempt_at: string | null;
  created_at: string;
}

export interface SmsFilterParams {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface SmsStats {
  sentToday: number;
  failedToday: number;
  pendingCount: number;
  totalDeliveryRate: number;
}

/**
 * Fetches SMS outbox log records with pagination and status filters.
 */
export async function fetchSmsOutbox(
  params: SmsFilterParams
): Promise<{ rows: SmsOutboxRow[]; totalCount: number }> {
  const { status, search, page = 1, pageSize = 25 } = params;

  let query = supabase
    .from('sms_outbox')
    .select(
      `
      id,
      sale_id,
      phone,
      message,
      status,
      attempts,
      last_error,
      provider_message_id,
      sent_at,
      next_attempt_at,
      created_at,
      sales:sale_id ( bill_no )
    `,
      { count: 'exact' }
    );

  if (status && status !== 'all') {
    query = query.eq('status', status as SmsStatus);
  }

  if (search && search.trim().length > 0) {
    const term = search.trim();
    query = query.or(`phone.ilike.%${term}%,message.ilike.%${term}%`);
  }

  query = query.order('created_at', { ascending: false });
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    console.error('Failed to fetch SMS outbox:', error);
    throw new Error(error.message);
  }

  const rows: SmsOutboxRow[] = (data || []).map((row: unknown) => {
    const r = row as SmsOutboxRow & { sales?: { bill_no?: string | null } };
    return {
      id: r.id,
      sale_id: r.sale_id,
      bill_no: r.sales?.bill_no || null,
      phone: r.phone,
      message: r.message,
      status: r.status,
      attempts: r.attempts,
      last_error: r.last_error,
      provider_message_id: r.provider_message_id,
      sent_at: r.sent_at,
      next_attempt_at: r.next_attempt_at,
      created_at: r.created_at,
    };
  });

  return {
    rows,
    totalCount: count || 0,
  };
}

/**
 * Retrieves the SMS status row for a specific sale.
 */
export async function fetchSaleSms(saleId: string): Promise<SmsOutboxRow | null> {
  const { data, error } = await supabase
    .from('sms_outbox')
    .select('*')
    .eq('sale_id', saleId)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch sale SMS:', error);
    return null;
  }

  return data as SmsOutboxRow | null;
}

/**
 * Subscribes to real-time changes on the sms_outbox row for a completed sale.
 * Cashiers see instant live updates as status transitions from pending -> sending -> sent.
 */
export function subscribeToSaleSms(
  saleId: string,
  onUpdate: (updated: SmsOutboxRow) => void
): () => void {
  const channel = supabase
    .channel(`sms-sale-${saleId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'sms_outbox',
        filter: `sale_id=eq.${saleId}`,
      },
      (payload) => {
        if (payload.new && typeof payload.new === 'object' && 'id' in payload.new) {
          onUpdate(payload.new as SmsOutboxRow);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Manually dispatches a retry for a specific failed SMS outbox record
 * by invoking the send-sms Edge Function with authenticated staff session.
 */
export async function retrySmsOutbox(outboxId: string): Promise<{ success: boolean; message?: string }> {
  const { data, error } = await supabase.functions.invoke('send-sms', {
    body: { outbox_id: outboxId },
  });

  if (error) {
    console.error('Edge function retry error:', error);
    throw new Error(error.message || 'Failed to dispatch retry through SMS gateway');
  }

  return {
    success: data?.success ?? true,
    message: data?.results?.[0]?.error || undefined,
  };
}

/**
 * Computes today's aggregate delivery metrics for dashboard cards.
 */
export async function fetchSmsStats(): Promise<SmsStats> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayIso = startOfToday.toISOString();

  const [sentRes, failedRes, pendingRes] = await Promise.all([
    supabase
      .from('sms_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gte('created_at', todayIso),
    supabase
      .from('sms_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('created_at', todayIso),
    supabase
      .from('sms_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ]);

  const sentCount = sentRes.count || 0;
  const failedCount = failedRes.count || 0;
  const pendingCount = pendingRes.count || 0;
  const totalAttempted = sentCount + failedCount;
  const deliveryRate = totalAttempted > 0 ? Math.round((sentCount / totalAttempted) * 100) : 100;

  return {
    sentToday: sentCount,
    failedToday: failedCount,
    pendingCount,
    totalDeliveryRate: deliveryRate,
  };
}
