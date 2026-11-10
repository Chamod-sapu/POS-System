-- ==============================================================================
-- Migration: 017_bill_audit.sql
-- Description: Automated Bill Accuracy Audit Engine:
--   1. Recomputes every bill from snapshot line columns using exact calc order.
--   2. Verifies payment balance: sum(payments) - change = total.
--   3. Audits all bills across date ranges and logs discrepancies into bill_audit_runs.
--   4. Nightly scheduled job via pg_cron.
--   5. Real-time helper for Dashboard and Accuracy Check UI panel.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. BILL AUDIT RUNS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bill_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  from_date date NOT NULL,
  to_date date NOT NULL,
  total_bills_audited int NOT NULL DEFAULT 0,
  discrepancy_count int NOT NULL DEFAULT 0,
  discrepancies jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL CHECK (status IN ('passed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bill_audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_audit_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY "bill_audit_runs_select" ON public.bill_audit_runs
  FOR SELECT TO authenticated
  USING (is_manager_or_owner());

CREATE POLICY "bill_audit_runs_admin" ON public.bill_audit_runs
  FOR ALL TO authenticated
  USING (is_manager_or_owner())
  WITH CHECK (is_manager_or_owner());

CREATE INDEX IF NOT EXISTS idx_bill_audit_runs_run_at ON public.bill_audit_runs(run_at DESC);

-- ------------------------------------------------------------------------------
-- 2. FUNCTION audit_all_bills(p_from date, p_to date)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_all_bills(
  p_from date,
  p_to date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale RECORD;
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  
  v_audited_count int := 0;
  v_discrepancy_count int := 0;
  v_discrepancies jsonb := '[]'::jsonb;
  
  -- Calculated totals for single bill
  v_calc_subtotal bigint;
  v_calc_item_disc bigint;
  v_calc_line_total bigint;
  v_calc_total bigint;
  v_payment_sum bigint;
  v_expected_payment_total bigint;
  v_issues text[];
BEGIN
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Manager or owner permission required';
  END IF;

  SELECT v_start_ts, v_end_ts INTO v_start_ts, v_end_ts FROM get_colombo_bounds(p_from, p_to);

  FOR v_sale IN
    SELECT 
      s.id,
      s.bill_no,
      s.subtotal_cents,
      s.line_discount_cents,
      s.bill_discount_cents,
      s.tax_cents,
      s.total_cents,
      s.paid_cents,
      s.change_cents,
      s.status,
      s.created_at
    FROM sales s
    WHERE s.created_at >= v_start_ts
      AND s.created_at < v_end_ts
      AND s.status != 'voided'
    ORDER BY s.created_at ASC
  LOOP
    v_audited_count := v_audited_count + 1;
    v_issues := ARRAY[]::text[];

    -- 1. Recompute from snapshot line items
    SELECT 
      COALESCE(SUM(round(si.quantity * si.unit_price_cents)::bigint), 0),
      COALESCE(SUM(si.discount_cents), 0),
      COALESCE(SUM(si.line_total_cents), 0)
    INTO 
      v_calc_subtotal,
      v_calc_item_disc,
      v_calc_line_total
    FROM sale_items si
    WHERE si.sale_id = v_sale.id;

    -- Check subtotal match
    IF v_calc_subtotal <> v_sale.subtotal_cents THEN
      v_issues := array_append(v_issues, format('SUBTOTAL_MISMATCH: stored=%s, calc=%s', v_sale.subtotal_cents, v_calc_subtotal));
    END IF;

    -- Check line discount match
    IF v_calc_item_disc <> v_sale.line_discount_cents THEN
      v_issues := array_append(v_issues, format('ITEM_DISCOUNT_MISMATCH: stored=%s, calc=%s', v_sale.line_discount_cents, v_calc_item_disc));
    END IF;

    -- Check lines sum = grand total
    IF v_calc_line_total <> v_sale.total_cents THEN
      v_issues := array_append(v_issues, format('LINE_TOTALS_MISMATCH: stored_total=%s, lines_sum=%s', v_sale.total_cents, v_calc_line_total));
    END IF;

    -- 2. Check payment integrity
    SELECT COALESCE(SUM(amount_cents), 0)
    INTO v_payment_sum
    FROM payments
    WHERE sale_id = v_sale.id;

    v_expected_payment_total := v_payment_sum - COALESCE(v_sale.change_cents, 0);

    IF v_expected_payment_total <> v_sale.total_cents THEN
      v_issues := array_append(v_issues, format('PAYMENT_MISMATCH: total=%s, payments_net=%s (paid=%s, change=%s)', 
        v_sale.total_cents, v_expected_payment_total, v_payment_sum, v_sale.change_cents));
    END IF;

    -- If issues found, record discrepancy
    IF array_length(v_issues, 1) > 0 THEN
      v_discrepancy_count := v_discrepancy_count + 1;
      v_discrepancies := v_discrepancies || jsonb_build_object(
        'bill_id', v_sale.id,
        'bill_no', v_sale.bill_no,
        'created_at', v_sale.created_at,
        'stored_total_cents', v_sale.total_cents,
        'calculated_total_cents', v_calc_line_total,
        'issues', to_jsonb(v_issues)
      );
    END IF;
  END LOOP;

  -- Record run
  INSERT INTO public.bill_audit_runs (
    from_date,
    to_date,
    total_bills_audited,
    discrepancy_count,
    discrepancies,
    status
  ) VALUES (
    p_from,
    p_to,
    v_audited_count,
    v_discrepancy_count,
    v_discrepancies,
    CASE WHEN v_discrepancy_count = 0 THEN 'passed' ELSE 'failed' END
  );

  RETURN jsonb_build_object(
    'from_date', p_from,
    'to_date', p_to,
    'total_bills_audited', v_audited_count,
    'discrepancy_count', v_discrepancy_count,
    'status', CASE WHEN v_discrepancy_count = 0 THEN 'passed' ELSE 'failed' END,
    'discrepancies', v_discrepancies
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. NIGHTLY RUNNER (Callable by pg_cron at 03:00 Asia/Colombo)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_nightly_bill_audit()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Colombo')::date;
  v_week_ago date := v_today - 7;
BEGIN
  RETURN public.audit_all_bills(v_week_ago, v_today);
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. GET LATEST AUDIT STATUS (For Dashboard Alert & Accuracy UI)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_latest_bill_audit()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_latest public.bill_audit_runs%ROWTYPE;
BEGIN
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  SELECT * INTO v_latest
  FROM public.bill_audit_runs
  ORDER BY run_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'has_run', false,
      'status', 'passed',
      'discrepancy_count', 0,
      'total_bills_audited', 0,
      'last_run_at', null,
      'discrepancies', '[]'::jsonb
    );
  END IF;

  RETURN jsonb_build_object(
    'has_run', true,
    'status', v_latest.status,
    'discrepancy_count', v_latest.discrepancy_count,
    'total_bills_audited', v_latest.total_bills_audited,
    'from_date', v_latest.from_date,
    'to_date', v_latest.to_date,
    'last_run_at', v_latest.run_at,
    'discrepancies', v_latest.discrepancies
  );
END;
$$;

REVOKE ALL ON FUNCTION public.audit_all_bills(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.run_nightly_bill_audit() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_latest_bill_audit() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.audit_all_bills(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_nightly_bill_audit() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_bill_audit() TO authenticated;

