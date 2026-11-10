-- ==============================================================================
-- Migration: 010_sms.sql
-- Description: SMS Notification Infrastructure for Wewala POS
--              - Adds next_attempt_at and unique constraint to sms_outbox
--              - claim_sms_batch (atomic batch locking via FOR UPDATE SKIP LOCKED)
--              - record_sms_result (exponential backoff & failure handling)
--              - Non-blocking pg_net trigger on INSERT into sms_outbox
--              - pg_cron job schedule definition for recurring retries
--              - Updated RLS for cashier realtime subscription
-- ==============================================================================

-- 1. EXTEND SMS_OUTBOX TABLE
ALTER TABLE sms_outbox
ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();

-- Unique index so a bill can never trigger duplicate SMS outbox rows
CREATE UNIQUE INDEX IF NOT EXISTS unq_sms_outbox_sale_id ON sms_outbox(sale_id);

-- Index for high-performance claim queries on pending queue
CREATE INDEX IF NOT EXISTS idx_sms_outbox_pending_queue 
ON sms_outbox (status, next_attempt_at) 
WHERE status = 'pending';

-- 2. CLAIM_SMS_BATCH (Atomically lock pending batch for Edge Function delivery)
CREATE OR REPLACE FUNCTION claim_sms_batch(p_limit int DEFAULT 20)
RETURNS SETOF sms_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH batch AS (
    SELECT id
    FROM sms_outbox
    WHERE status = 'pending'
      AND attempts < 5
      AND next_attempt_at <= now()
    ORDER BY next_attempt_at ASC, created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE sms_outbox s
  SET status = 'sending'
  FROM batch
  WHERE s.id = batch.id
  RETURNING s.*;
END;
$$;

-- 3. RECORD_SMS_RESULT (Success settlement or exponential backoff)
CREATE OR REPLACE FUNCTION record_sms_result(
  p_id uuid,
  p_ok boolean,
  p_provider_id text DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row sms_outbox%ROWTYPE;
  v_new_attempts int;
  v_new_status sms_status;
  v_next_attempt timestamptz;
BEGIN
  SELECT * INTO v_row FROM sms_outbox WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SMS_RECORD_NOT_FOUND';
  END IF;

  IF p_ok THEN
    UPDATE sms_outbox
    SET status = 'sent',
        sent_at = now(),
        provider_message_id = p_provider_id,
        last_error = NULL
    WHERE id = p_id;

    RETURN jsonb_build_object(
      'success', true,
      'id', p_id,
      'status', 'sent',
      'provider_id', p_provider_id
    );
  ELSE
    v_new_attempts := v_row.attempts + 1;

    -- Exponential backoff schedule:
    -- Attempt 1 -> 1 min
    -- Attempt 2 -> 5 min
    -- Attempt 3 -> 15 min
    -- Attempt 4 -> 60 min
    -- Attempt 5+ -> failed
    IF v_new_attempts >= 5 THEN
      v_new_status := 'failed';
      v_next_attempt := now() + interval '24 hours';
    ELSE
      v_new_status := 'pending';
      CASE v_new_attempts
        WHEN 1 THEN v_next_attempt := now() + interval '1 minute';
        WHEN 2 THEN v_next_attempt := now() + interval '5 minutes';
        WHEN 3 THEN v_next_attempt := now() + interval '15 minutes';
        ELSE v_next_attempt := now() + interval '60 minutes';
      END CASE;
    END IF;

    UPDATE sms_outbox
    SET status = v_new_status,
        attempts = v_new_attempts,
        last_error = p_error,
        next_attempt_at = v_next_attempt
    WHERE id = p_id;

    RETURN jsonb_build_object(
      'success', false,
      'id', p_id,
      'status', v_new_status,
      'attempts', v_new_attempts,
      'next_attempt_at', v_next_attempt,
      'error', p_error
    );
  END IF;
END;
$$;

-- 4. NON-BLOCKING TRIGGER DISPATCH VIA pg_net
-- When an SMS is queued, trigger immediately calls the Edge Function asynchronously.
-- If pg_net is not installed or network fails, the sale completes without error.
CREATE OR REPLACE FUNCTION trigger_sms_outbox_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edge_url text;
  v_secret text;
BEGIN
  IF NEW.status = 'pending' THEN
    -- Read configuration settings safely
    v_edge_url := current_setting('app.settings.sms_edge_function_url', true);
    v_secret := current_setting('app.settings.sms_trigger_secret', true);

    IF v_edge_url IS NOT NULL AND v_edge_url <> '' THEN
      BEGIN
        PERFORM net.http_post(
          url := v_edge_url,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-sms-secret', COALESCE(v_secret, '')
          ),
          body := jsonb_build_object('event', 'new_sms', 'outbox_id', NEW.id)
        );
      EXCEPTION WHEN OTHERS THEN
        -- Never fail a sale because of SMS dispatch issues
        RAISE WARNING 'pg_net SMS dispatch deferred: %', SQLERRM;
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sms_outbox_insert ON sms_outbox;
CREATE TRIGGER trg_sms_outbox_insert
AFTER INSERT ON sms_outbox
FOR EACH ROW
EXECUTE FUNCTION trigger_sms_outbox_dispatch();

-- 5. ROW LEVEL SECURITY (Allow cashiers to view their own sales' SMS status for realtime)
DROP POLICY IF EXISTS sms_outbox_select_policy ON sms_outbox;
CREATE POLICY sms_outbox_select_policy ON sms_outbox
FOR SELECT USING (
  is_manager_or_owner() OR
  EXISTS (
    SELECT 1 FROM sales s
    WHERE s.id = sms_outbox.sale_id
      AND s.cashier_id = COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  )
);

-- ==============================================================================
-- SETUP INSTRUCTIONS FOR PG_NET, PG_CRON AND SECRETS
-- ==============================================================================
--
-- 1. Enable pg_net and pg_cron in Supabase Project:
--    Dashboard > Database > Extensions > Toggle ON "pg_net" and "pg_cron".
--
-- 2. Store Edge Function URL and Shared Secret in Postgres Settings or Vault:
--    ALTER DATABASE postgres SET "app.settings.sms_edge_function_url" = 'https://<project-ref>.supabase.co/functions/v1/send-sms';
--    ALTER DATABASE postgres SET "app.settings.sms_trigger_secret" = 'your-secure-sms-trigger-secret-here';
--
-- 3. Schedule 1-Minute Cron Retry:
--    SELECT cron.schedule(
--      'retry-pending-sms',
--      '* * * * *',
--      $$
--        SELECT net.http_post(
--          url := current_setting('app.settings.sms_edge_function_url', true),
--          headers := jsonb_build_object(
--            'Content-Type', 'application/json',
--            'x-sms-secret', current_setting('app.settings.sms_trigger_secret', true)
--          ),
--          body := '{"event":"cron_retry"}'::jsonb
--        );
--      $$
--    );
-- ==============================================================================

