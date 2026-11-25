-- ==============================================================================
-- Migration: 019_security_audit_remediation.sql
-- Description: Comprehensive Remediation of Security Audit Findings:
--   - VULN-001: Validate & atomically deduct customers.credit_balance_cents on store_credit payments in create_sale()
--   - VULN-002: Protect customers.credit_balance_cents & points_balance via trigger; revoke direct customer_points_ledger inserts
--   - VULN-003: Drop leftover 007_rls.sql update policies on profiles & shop_settings; fail-closed is_owner_aal2(); prevent last-owner loss
--   - VULN-006: Add is_staff() and object-ownership BOLA checks to get_bill, get_return, mark_bill_printed, x_report, record_cash_movement
--   - VULN-007: Revoke authenticated/anon EXECUTE on claim_sms_batch & record_sms_result (service_role only)
--   - VULN-008: Strip cost_price_cents from quote_sale() and restrict calc_bill() to internal callers
--   - VULN-009: Revoke direct client writes on cash_movements, supplier_payments, product_cost_history, purchases, purchase_items, bill_audit_runs
--   - VULN-016: Guard test GUCs (app.current_user_id, app.skip_shift_check) to offline superuser only; add bulk/report bounds
--   - VULN-017: Harden audit IP extraction (no raw spoofed x-forwarded-for), add log_bill_integrity_error & log_data_export_audit RPCs
--   - VULN-019: Enforce combined cashier line + bill discount ceiling inside calc_bill()
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. INTERNAL SECURITY HELPERS (Caller UID Resolution & Audit IP)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_caller_uid()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN auth.uid();
  END IF;

  -- Allow test-harness GUC fallback ONLY in offline superuser CI runs without JWT claims
  IF current_user IN ('postgres', 'supabase_admin')
     AND NULLIF(current_setting('request.jwt.claims', true), '') IS NULL THEN
    RETURN NULLIF(current_setting('app.current_user_id', true), '')::uuid;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_audit_ip()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cf_ip text;
BEGIN
  BEGIN
    v_cf_ip := NULLIF(trim(current_setting('request.headers', true)::json->>'cf-connecting-ip'), '');
  EXCEPTION WHEN OTHERS THEN
    v_cf_ip := NULL;
  END;

  RETURN COALESCE(v_cf_ip, inet_client_addr()::text);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_caller_uid() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_audit_ip() FROM PUBLIC, anon, authenticated;

-- Update current_user_role() to use guarded resolve_caller_uid() and locked search_path
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role user_role;
  v_uid uuid := public.resolve_caller_uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT role INTO v_role
  FROM profiles
  WHERE id = v_uid AND is_active = true;

  RETURN v_role;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. VULN-003: FAIL-CLOSED MFA (AAL2) & DROP LEGACY BYPASS POLICIES + LAST OWNER GUARD
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_owner_aal2()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role user_role;
  v_aal text;
  v_jwt jsonb;
BEGIN
  v_role := public.current_user_role();
  IF v_role IS DISTINCT FROM 'owner' THEN
    RETURN false;
  END IF;

  BEGIN
    v_jwt := auth.jwt();
    v_aal := v_jwt->>'aal';
  EXCEPTION WHEN OTHERS THEN
    v_jwt := NULL;
    v_aal := NULL;
  END;

  IF v_aal = 'aal2' THEN
    RETURN true;
  END IF;

  IF v_jwt IS NOT NULL THEN
    -- JWT exists without aal2 -> fail closed
    RETURN false;
  END IF;

  -- Pure offline psql CI test harness without JWT claims
  IF current_user IN ('postgres', 'supabase_admin')
     AND NULLIF(current_setting('request.jwt.claims', true), '') IS NULL THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- Drop legacy 007_rls.sql update policies that lacked AAL2 check and bypassed 016_hardening.sql
DROP POLICY IF EXISTS "shop_settings_update_policy" ON public.shop_settings;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;

DROP POLICY IF EXISTS "shop_settings_owner_update" ON public.shop_settings;
CREATE POLICY "shop_settings_owner_update" ON public.shop_settings
  FOR UPDATE TO authenticated
  USING (is_owner_aal2())
  WITH CHECK (is_owner_aal2());

DROP POLICY IF EXISTS "profiles_owner_update" ON public.profiles;
CREATE POLICY "profiles_owner_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (is_owner_aal2())
  WITH CHECK (is_owner_aal2());

-- Database-level guard preventing demotion or deactivation of the final active owner
CREATE OR REPLACE FUNCTION public.prevent_last_owner_loss()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_other_owners int;
BEGIN
  IF OLD.role = 'owner' AND OLD.is_active = true THEN
    IF TG_OP = 'DELETE' OR NEW.role IS DISTINCT FROM 'owner' OR NEW.is_active = false THEN
      SELECT count(*) INTO v_other_owners
      FROM public.profiles
      WHERE role = 'owner'
        AND is_active = true
        AND id <> OLD.id;

      IF v_other_owners = 0 THEN
        RAISE EXCEPTION 'LAST_OWNER_PROTECTION: Cannot demote or deactivate the only active store owner.';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_owner_loss ON public.profiles;
CREATE TRIGGER trg_prevent_last_owner_loss
  BEFORE UPDATE OR DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_last_owner_loss();

-- ------------------------------------------------------------------------------
-- 3. VULN-002: PROTECT CUSTOMER BALANCES & POINTS LEDGER
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_customer_balance_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.credit_balance_cents IS DISTINCT FROM NEW.credit_balance_cents
     OR OLD.points_balance IS DISTINCT FROM NEW.points_balance THEN
    IF current_setting('app.customer_ledger_write', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'DIRECT_BALANCE_WRITE_PROHIBITED: Direct modifications to customer credit or loyalty points are blocked.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_customer_balances ON public.customers;
CREATE TRIGGER trg_protect_customer_balances
  BEFORE UPDATE OF credit_balance_cents, points_balance ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.check_customer_balance_write();

DROP POLICY IF EXISTS customer_points_ledger_insert_policy ON public.customer_points_ledger;
REVOKE INSERT, UPDATE, DELETE ON public.customer_points_ledger FROM anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. VULN-009: REVOKE DIRECT CLIENT WRITES ON FINANCIAL & AUDIT TABLES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "cash_movements_staff_insert" ON public.cash_movements;
DROP POLICY IF EXISTS "cash_movements_staff_select" ON public.cash_movements;
CREATE POLICY "cash_movements_staff_select" ON public.cash_movements
  FOR SELECT TO authenticated
  USING (
    is_manager_or_owner()
    OR EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = cash_movements.shift_id
        AND s.cashier_id = public.resolve_caller_uid()
        AND is_staff()
    )
  );
REVOKE INSERT, UPDATE, DELETE ON public.cash_movements FROM anon, authenticated;

DROP POLICY IF EXISTS supplier_payments_insert_policy ON public.supplier_payments;
REVOKE INSERT, UPDATE, DELETE ON public.supplier_payments FROM anon, authenticated;

DROP POLICY IF EXISTS product_cost_history_insert_policy ON public.product_cost_history;
REVOKE INSERT, UPDATE, DELETE ON public.product_cost_history FROM anon, authenticated;

DROP POLICY IF EXISTS purchases_insert_policy ON public.purchases;
DROP POLICY IF EXISTS purchases_update_policy ON public.purchases;
REVOKE INSERT, UPDATE, DELETE ON public.purchases FROM anon, authenticated;

DROP POLICY IF EXISTS purchase_items_insert_policy ON public.purchase_items;
DROP POLICY IF EXISTS purchase_items_update_policy ON public.purchase_items;
REVOKE INSERT, UPDATE, DELETE ON public.purchase_items FROM anon, authenticated;

DROP POLICY IF EXISTS "bill_audit_runs_admin" ON public.bill_audit_runs;
REVOKE INSERT, UPDATE, DELETE ON public.bill_audit_runs FROM anon, authenticated;

-- ------------------------------------------------------------------------------
-- 5. VULN-007: RESTRICT INTERNAL SMS QUEUE RPCs TO service_role
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.claim_sms_batch(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_sms_batch(int) TO service_role;

REVOKE ALL ON FUNCTION public.record_sms_result(uuid, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_sms_result(uuid, boolean, text, text) TO service_role;

-- ------------------------------------------------------------------------------
-- 6. VULN-008, VULN-016, VULN-019: HARDEN calc_bill() & STRIP COST IN quote_sale()
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calc_bill(
  p_items jsonb,
  p_bill_discount jsonb DEFAULT '{"type":"none","value":0}'::jsonb,
  p_lock_products boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_user_role user_role;
  v_user_active boolean;
  v_shop shop_settings%ROWTYPE;
  v_product_ids uuid[] := ARRAY[]::uuid[];
  v_prod products%ROWTYPE;
  v_item_rec record;
  v_calc_lines sale_calc_line_t[] := ARRAY[]::sale_calc_line_t[];
  v_line sale_calc_line_t;
  v_lines_json jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_subtotal_cents bigint := 0;
  v_line_discounts_total bigint := 0;
  v_items_net bigint := 0;
  v_bill_disc_type text := 'none';
  v_bill_disc_val numeric := 0;
  v_bill_discount_cents bigint := 0;
  v_base_alloc_sum bigint := 0;
  v_rem_cents int := 0;
  v_tax_rate numeric(5,2);
  v_tax_rate_bp bigint;
  v_tax_cents_total bigint := 0;
  v_taxable_cents bigint := 0;
  v_total_cents bigint := 0;
  v_sum_line_totals bigint := 0;
  v_idx int;
  v_qty_milli bigint;
  v_disc_type text;
  v_disc_val numeric;
  v_line_disc bigint;
  v_gross bigint;
  v_net bigint;
BEGIN
  v_user_id := public.resolve_caller_uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  SELECT role, is_active INTO v_user_role, v_user_active
  FROM profiles
  WHERE id = v_user_id;

  IF NOT FOUND OR NOT v_user_active THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT:Cart is empty';
  END IF;

  IF jsonb_array_length(p_items) > 500 THEN
    RAISE EXCEPTION 'INVALID_INPUT:Cart cannot exceed 500 line items';
  END IF;

  SELECT * INTO v_shop FROM shop_settings WHERE id = 1;

  FOR v_item_rec IN (
    WITH raw_items AS (
      SELECT 
        (elem->>'product_id')::uuid AS product_id,
        (elem->>'quantity')::numeric(12,3) AS quantity,
        COALESCE(elem->>'discount_type', 'none') AS discount_type,
        COALESCE((elem->>'discount_value')::numeric, 0) AS discount_value
      FROM jsonb_array_elements(p_items) AS elem
    )
    SELECT 
      product_id,
      SUM(quantity) AS quantity,
      CASE 
        WHEN bool_and(discount_type = 'none') THEN 'none'
        WHEN bool_and(discount_type = 'amount') THEN 'amount'
        WHEN bool_and(discount_type = 'percent') AND min(discount_value) = max(discount_value) THEN 'percent'
        ELSE 'amount'
      END AS discount_type,
      CASE 
        WHEN bool_and(discount_type = 'none') THEN 0
        WHEN bool_and(discount_type = 'amount') THEN SUM(discount_value)
        WHEN bool_and(discount_type = 'percent') AND min(discount_value) = max(discount_value) THEN min(discount_value)
        ELSE SUM(discount_value)
      END AS discount_value
    FROM raw_items
    GROUP BY product_id
  ) LOOP
    IF v_item_rec.quantity <= 0 THEN
      RAISE EXCEPTION 'INVALID_INPUT:Quantity must be greater than zero';
    END IF;

    IF v_item_rec.discount_value < 0 THEN
      RAISE EXCEPTION 'INVALID_INPUT:Discount cannot be negative';
    END IF;

    IF v_item_rec.discount_type NOT IN ('none', 'percent', 'amount') THEN
      RAISE EXCEPTION 'INVALID_INPUT:Invalid discount type';
    END IF;

    v_product_ids := array_append(v_product_ids, v_item_rec.product_id);
  END LOOP;

  v_idx := 0;

  FOR v_prod IN 
    SELECT * 
    FROM products 
    WHERE id = ANY(v_product_ids) 
    ORDER BY id ASC 
  LOOP
    IF p_lock_products THEN
      PERFORM 1 FROM products WHERE id = v_prod.id FOR UPDATE;
    END IF;

    v_idx := v_idx + 1;

    SELECT * INTO v_item_rec FROM (
      WITH raw_items AS (
        SELECT 
          (elem->>'product_id')::uuid AS product_id,
          (elem->>'quantity')::numeric(12,3) AS quantity,
          COALESCE(elem->>'discount_type', 'none') AS discount_type,
          COALESCE((elem->>'discount_value')::numeric, 0) AS discount_value
        FROM jsonb_array_elements(p_items) AS elem
      )
      SELECT 
        product_id,
        SUM(quantity) AS quantity,
        CASE 
          WHEN bool_and(discount_type = 'none') THEN 'none'
          WHEN bool_and(discount_type = 'amount') THEN 'amount'
          WHEN bool_and(discount_type = 'percent') AND min(discount_value) = max(discount_value) THEN 'percent'
          ELSE 'amount'
        END AS discount_type,
        CASE 
          WHEN bool_and(discount_type = 'none') THEN 0
          WHEN bool_and(discount_type = 'amount') THEN SUM(discount_value)
          WHEN bool_and(discount_type = 'percent') AND min(discount_value) = max(discount_value) THEN min(discount_value)
          ELSE SUM(discount_value)
        END AS discount_value
      FROM raw_items
      WHERE product_id = v_prod.id
      GROUP BY product_id
    ) q;

    IF NOT v_prod.is_active THEN
      RAISE EXCEPTION 'PRODUCT_INACTIVE:%', v_prod.sku;
    END IF;

    IF NOT v_prod.allow_decimal_qty AND v_item_rec.quantity <> trunc(v_item_rec.quantity) THEN
      RAISE EXCEPTION 'INVALID_QUANTITY:%:Decimal quantity not allowed', v_prod.sku;
    END IF;

    IF v_prod.stock_qty < v_item_rec.quantity THEN
      IF p_lock_products THEN
        RAISE EXCEPTION 'OUT_OF_STOCK:%:%', v_prod.sku, v_prod.stock_qty;
      ELSE
        v_warnings := v_warnings || jsonb_build_object(
          'type', 'OUT_OF_STOCK',
          'product_id', v_prod.id,
          'sku', v_prod.sku,
          'requested_qty', v_item_rec.quantity,
          'available_qty', v_prod.stock_qty,
          'message', 'Only ' || v_prod.stock_qty || ' ' || v_prod.unit || ' available for ' || v_prod.name
        );
      END IF;
    ELSIF v_prod.stock_qty <= v_prod.reorder_level THEN
      v_warnings := v_warnings || jsonb_build_object(
        'type', 'LOW_STOCK',
        'product_id', v_prod.id,
        'sku', v_prod.sku,
        'available_qty', v_prod.stock_qty,
        'reorder_level', v_prod.reorder_level,
        'message', 'Low stock alert for ' || v_prod.name || ' (' || v_prod.stock_qty || ' remaining)'
      );
    END IF;

    v_qty_milli := (v_item_rec.quantity * 1000)::bigint;
    v_gross := round_half_up(v_prod.selling_price_cents * v_qty_milli, 1000);

    v_disc_type := v_item_rec.discount_type;
    v_disc_val := v_item_rec.discount_value;

    IF v_disc_type = 'percent' THEN
      IF v_user_role = 'cashier' AND v_disc_val > v_shop.max_cashier_discount_percent THEN
        RAISE EXCEPTION 'DISCOUNT_NOT_ALLOWED';
      END IF;
      v_line_disc := round_half_up(v_gross * (v_disc_val * 100)::bigint, 10000);
    ELSIF v_disc_type = 'amount' THEN
      v_line_disc := (v_disc_val)::bigint;
      IF v_user_role = 'cashier' AND v_gross > 0 THEN
        IF (v_line_disc * 10000) > (v_gross * (v_shop.max_cashier_discount_percent * 100)::bigint) THEN
          RAISE EXCEPTION 'DISCOUNT_NOT_ALLOWED';
        END IF;
      END IF;
    ELSE
      v_line_disc := 0;
    END IF;

    IF v_line_disc > v_gross THEN
      v_line_disc := v_gross;
    END IF;
    IF v_line_disc < 0 THEN
      v_line_disc := 0;
    END IF;

    v_net := v_gross - v_line_disc;

    v_subtotal_cents := v_subtotal_cents + v_gross;
    v_line_discounts_total := v_line_discounts_total + v_line_disc;
    v_items_net := v_items_net + v_net;

    v_line.line_idx := v_idx;
    v_line.product_id := v_prod.id;
    v_line.product_name := v_prod.name;
    v_line.sku := v_prod.sku;
    v_line.unit := v_prod.unit;
    v_line.cost_price_cents := v_prod.cost_price_cents;
    v_line.selling_price_cents := v_prod.selling_price_cents;
    v_line.tax_exempt := v_prod.tax_exempt;
    v_line.quantity := v_item_rec.quantity;
    v_line.gross_line := v_gross;
    v_line.line_discount := v_line_disc;
    v_line.net_line := v_net;
    v_line.allocated_bill_discount := 0;
    v_line.line_after := v_net;
    v_line.line_tax := 0;
    v_line.line_total := v_net;

    v_calc_lines := array_append(v_calc_lines, v_line);
  END LOOP;

  IF p_bill_discount IS NOT NULL AND p_bill_discount <> 'null'::jsonb THEN
    v_bill_disc_type := COALESCE(p_bill_discount->>'type', 'none');
    v_bill_disc_val := COALESCE((p_bill_discount->>'value')::numeric, 0);

    IF v_bill_disc_val < 0 THEN
      RAISE EXCEPTION 'INVALID_INPUT:Negative bill discount';
    END IF;

    IF v_bill_disc_type = 'percent' THEN
      IF v_user_role = 'cashier' AND v_bill_disc_val > v_shop.max_cashier_discount_percent THEN
        RAISE EXCEPTION 'DISCOUNT_NOT_ALLOWED';
      END IF;
      v_bill_discount_cents := round_half_up(v_items_net * (v_bill_disc_val * 100)::bigint, 10000);
    ELSIF v_bill_disc_type = 'amount' THEN
      v_bill_discount_cents := (v_bill_disc_val)::bigint;
      IF v_user_role = 'cashier' AND v_items_net > 0 THEN
        IF (v_bill_discount_cents * 10000) > (v_items_net * (v_shop.max_cashier_discount_percent * 100)::bigint) THEN
          RAISE EXCEPTION 'DISCOUNT_NOT_ALLOWED';
        END IF;
      END IF;
    END IF;
  END IF;

  IF v_bill_discount_cents > v_items_net THEN
    v_bill_discount_cents := v_items_net;
  END IF;
  IF v_bill_discount_cents < 0 THEN
    v_bill_discount_cents := 0;
  END IF;

  -- VULN-019: Prevent cashier from stacking line + bill discounts above configured single-bill cap
  IF v_user_role = 'cashier' AND v_subtotal_cents > 0 THEN
    IF ((v_line_discounts_total + v_bill_discount_cents) * 10000) > (v_subtotal_cents * (v_shop.max_cashier_discount_percent * 100)::bigint) THEN
      RAISE EXCEPTION 'DISCOUNT_NOT_ALLOWED';
    END IF;
  END IF;

  IF v_items_net > 0 AND v_bill_discount_cents > 0 THEN
    v_base_alloc_sum := 0;
    FOR i IN 1..cardinality(v_calc_lines) LOOP
      v_calc_lines[i].allocated_bill_discount := (v_bill_discount_cents * v_calc_lines[i].net_line) / v_items_net;
      v_base_alloc_sum := v_base_alloc_sum + v_calc_lines[i].allocated_bill_discount;
    END LOOP;

    v_rem_cents := (v_bill_discount_cents - v_base_alloc_sum)::int;

    FOR v_item_rec IN (
      SELECT 
        l.line_idx,
        ROW_NUMBER() OVER (
          ORDER BY ((v_bill_discount_cents * l.net_line) % v_items_net) DESC, l.line_idx ASC
        ) AS rank
      FROM unnest(v_calc_lines) AS l
    ) LOOP
      IF v_item_rec.rank <= v_rem_cents THEN
        v_calc_lines[v_item_rec.line_idx].allocated_bill_discount := 
          v_calc_lines[v_item_rec.line_idx].allocated_bill_discount + 1;
      END IF;
      v_calc_lines[v_item_rec.line_idx].line_after := 
        v_calc_lines[v_item_rec.line_idx].net_line - v_calc_lines[v_item_rec.line_idx].allocated_bill_discount;
    END LOOP;
  ELSE
    FOR i IN 1..cardinality(v_calc_lines) LOOP
      v_calc_lines[i].allocated_bill_discount := 0;
      v_calc_lines[i].line_after := v_calc_lines[i].net_line;
    END LOOP;
  END IF;

  v_tax_rate := CASE WHEN v_shop.tax_enabled THEN v_shop.tax_rate_percent ELSE 0.00 END;
  v_tax_rate_bp := (v_tax_rate * 100)::bigint;

  v_tax_cents_total := 0;
  v_sum_line_totals := 0;

  FOR i IN 1..cardinality(v_calc_lines) LOOP
    IF v_shop.tax_enabled AND NOT v_calc_lines[i].tax_exempt AND v_tax_rate_bp > 0 THEN
      IF v_shop.tax_inclusive THEN
        v_calc_lines[i].line_tax := round_half_up(
          v_calc_lines[i].line_after * v_tax_rate_bp, 
          10000 + v_tax_rate_bp
        );
      ELSE
        v_calc_lines[i].line_tax := round_half_up(
          v_calc_lines[i].line_after * v_tax_rate_bp, 
          10000
        );
      END IF;
    ELSE
      v_calc_lines[i].line_tax := 0;
    END IF;

    v_tax_cents_total := v_tax_cents_total + v_calc_lines[i].line_tax;

    IF NOT v_shop.tax_inclusive THEN
      v_calc_lines[i].line_total := v_calc_lines[i].line_after + v_calc_lines[i].line_tax;
    ELSE
      v_calc_lines[i].line_total := v_calc_lines[i].line_after;
    END IF;

    v_sum_line_totals := v_sum_line_totals + v_calc_lines[i].line_total;
  END LOOP;

  IF NOT v_shop.tax_inclusive THEN
    v_total_cents := (v_items_net - v_bill_discount_cents) + v_tax_cents_total;
  ELSE
    v_total_cents := (v_items_net - v_bill_discount_cents);
  END IF;

  v_taxable_cents := v_total_cents - v_tax_cents_total;

  IF v_sum_line_totals <> v_total_cents THEN
    RAISE EXCEPTION 'TOTAL_MISMATCH';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'line_idx', l.line_idx,
      'product_id', l.product_id,
      'sku', l.sku,
      'name', l.product_name,
      'unit', l.unit,
      'quantity', l.quantity,
      'unit_price_cents', l.selling_price_cents,
      'cost_price_cents', l.cost_price_cents,
      'tax_exempt', l.tax_exempt,
      'gross_line_cents', l.gross_line,
      'line_discount_cents', l.line_discount,
      'net_line_cents', l.net_line,
      'allocated_bill_discount_cents', l.allocated_bill_discount,
      'line_after_cents', l.line_after,
      'line_tax_cents', l.line_tax,
      'line_total_cents', l.line_total
    ) ORDER BY l.line_idx ASC
  ) INTO v_lines_json
  FROM unnest(v_calc_lines) AS l;

  RETURN jsonb_build_object(
    'lines', COALESCE(v_lines_json, '[]'::jsonb),
    'subtotal_cents', v_subtotal_cents,
    'line_discount_cents', v_line_discounts_total,
    'bill_discount_cents', v_bill_discount_cents,
    'tax', jsonb_build_object(
      'rate_percent', v_tax_rate,
      'mode', CASE WHEN v_shop.tax_inclusive THEN 'inclusive' ELSE 'exclusive' END,
      'taxable_cents', v_taxable_cents,
      'tax_cents', v_tax_cents_total
    ),
    'total_cents', v_total_cents,
    'warnings', COALESCE(v_warnings, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.calc_bill(jsonb, jsonb, boolean) FROM PUBLIC, anon, authenticated;

-- VULN-008: Strip cost_price_cents from public quote_sale()
CREATE OR REPLACE FUNCTION public.quote_sale(
  p_items jsonb,
  p_bill_discount jsonb DEFAULT '{"type":"none","value":0}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_calc jsonb;
  v_sanitized_lines jsonb;
BEGIN
  v_calc := calc_bill(p_items, p_bill_discount, false);

  SELECT COALESCE(jsonb_agg(elem - 'cost_price_cents'), '[]'::jsonb)
  INTO v_sanitized_lines
  FROM jsonb_array_elements(COALESCE(v_calc->'lines', '[]'::jsonb)) AS elem;

  RETURN jsonb_set(v_calc, '{lines}', v_sanitized_lines);
END;
$$;

REVOKE ALL ON FUNCTION public.quote_sale(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quote_sale(jsonb, jsonb) TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. VULN-006: ENFORCE is_staff() & OWNERSHIP ON get_bill, get_return, mark_bill_printed, x_report, record_cash_movement
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_bill(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_sale record;
  v_shop record;
  v_cashier_name text;
  v_customer record;
  v_lines jsonb;
  v_payments jsonb;
  v_points_earned int := 0;
BEGIN
  v_user_id := public.resolve_caller_uid();
  IF v_user_id IS NULL OR NOT is_staff() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALE_NOT_FOUND';
  END IF;

  IF v_sale.cashier_id IS DISTINCT FROM v_user_id AND NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Cannot access another cashier''s bill';
  END IF;

  SELECT shop_name, address, phone, vat_reg_no, receipt_footer, loyalty_enabled 
  INTO v_shop 
  FROM shop_settings 
  WHERE id = 1;

  SELECT full_name INTO v_cashier_name 
  FROM profiles 
  WHERE id = v_sale.cashier_id;

  SELECT id, name, phone, points_balance INTO v_customer 
  FROM customers 
  WHERE id = v_sale.customer_id;

  IF v_customer.id IS NOT NULL THEN
    SELECT COALESCE(points, 0) INTO v_points_earned
    FROM customer_points_ledger
    WHERE sale_id = v_sale.id
    LIMIT 1;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'product_id', product_id,
      'name', product_name_snapshot,
      'sku', sku_snapshot,
      'unit', unit_snapshot,
      'quantity', quantity,
      'unit_price_cents', unit_price_cents_snapshot,
      'line_discount_cents', line_discount_cents,
      'line_tax_cents', line_tax_cents,
      'line_total_cents', line_total_cents
    ) ORDER BY created_at ASC
  ) INTO v_lines
  FROM sale_items
  WHERE sale_id = p_sale_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'method', method,
      'amount_cents', amount_cents,
      'reference', reference
    ) ORDER BY created_at ASC
  ) INTO v_payments
  FROM payments
  WHERE sale_id = p_sale_id;

  RETURN jsonb_build_object(
    'id', v_sale.id,
    'bill_no', v_sale.bill_no,
    'idempotency_key', v_sale.idempotency_key,
    'date_time', to_char(v_sale.created_at AT TIME ZONE 'Asia/Colombo', 'YYYY-MM-DD"T"HH24:MI:SSOF'),
    'status', v_sale.status,
    'print_count', v_sale.print_count,
    'is_duplicate', (v_sale.print_count >= 1),
    'shop', jsonb_build_object(
      'name', COALESCE(v_shop.shop_name, 'Wewala Store'),
      'address', COALESCE(v_shop.address, ''),
      'phone', COALESCE(v_shop.phone, ''),
      'vat_reg_no', v_shop.vat_reg_no,
      'footer', COALESCE(v_shop.receipt_footer, '')
    ),
    'cashier', jsonb_build_object(
      'id', v_sale.cashier_id,
      'name', COALESCE(v_cashier_name, 'Cashier')
    ),
    'customer', CASE 
      WHEN v_customer.id IS NOT NULL THEN jsonb_build_object(
        'id', v_customer.id,
        'name', v_customer.name,
        'phone', v_customer.phone,
        'points_balance', v_customer.points_balance,
        'points_earned', COALESCE(v_points_earned, 0)
      )
      ELSE NULL
    END,
    'lines', COALESCE(v_lines, '[]'::jsonb),
    'subtotal_cents', v_sale.subtotal_cents,
    'line_discount_cents', v_sale.line_discount_cents,
    'bill_discount_cents', v_sale.bill_discount_cents,
    'tax', jsonb_build_object(
      'rate_percent', v_sale.tax_rate_percent_snapshot,
      'mode', CASE WHEN v_sale.tax_inclusive_snapshot THEN 'inclusive' ELSE 'exclusive' END,
      'taxable_cents', v_sale.taxable_cents,
      'tax_cents', v_sale.tax_cents
    ),
    'total_cents', v_sale.total_cents,
    'payments', COALESCE(v_payments, '[]'::jsonb),
    'paid_cents', v_sale.paid_cents,
    'change_cents', v_sale.change_cents
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_bill_printed(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_print_count int;
  v_cashier_id uuid;
  v_user_id uuid := public.resolve_caller_uid();
BEGIN
  IF v_user_id IS NULL OR NOT is_staff() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  SELECT cashier_id INTO v_cashier_id FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALE_NOT_FOUND';
  END IF;

  IF v_cashier_id IS DISTINCT FROM v_user_id AND NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Cannot mark another cashier''s bill as printed';
  END IF;

  UPDATE sales
  SET print_count = print_count + 1
  WHERE id = p_sale_id
  RETURNING print_count INTO v_new_print_count;

  INSERT INTO audit_log (user_id, action, table_name, record_id, new_data)
  VALUES (
    v_user_id,
    'bill.print',
    'sales',
    p_sale_id::text,
    jsonb_build_object('print_count', v_new_print_count)
  );

  RETURN get_bill(p_sale_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_return(p_return_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_ret record;
  v_sale record;
  v_shop record;
  v_cashier record;
  v_lines jsonb;
BEGIN
  v_user_id := public.resolve_caller_uid();
  IF v_user_id IS NULL OR NOT is_staff() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  SELECT * INTO v_ret FROM sale_returns WHERE id = p_return_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RETURN_NOT_FOUND';
  END IF;

  SELECT * INTO v_sale FROM sales WHERE id = v_ret.sale_id;

  IF v_sale.cashier_id IS DISTINCT FROM v_user_id
     AND v_ret.created_by IS DISTINCT FROM v_user_id
     AND NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Cannot access another cashier''s return record';
  END IF;

  SELECT * INTO v_shop FROM shop_settings WHERE id = 1;
  SELECT id, full_name as name INTO v_cashier FROM profiles WHERE id = v_ret.created_by;

  SELECT jsonb_agg(
    jsonb_build_object(
      'sale_item_id', sri.sale_item_id,
      'name', si.product_name_snapshot,
      'sku', si.sku_snapshot,
      'unit', si.unit_snapshot,
      'quantity', sri.quantity,
      'unit_price_cents', si.unit_price_cents_snapshot,
      'refund_cents', sri.refund_cents
    )
  ) INTO v_lines
  FROM sale_return_items sri
  JOIN sale_items si ON sri.sale_item_id = si.id
  WHERE sri.return_id = p_return_id;

  RETURN jsonb_build_object(
    'id', v_ret.id,
    'return_no', v_ret.return_no,
    'sale_id', v_ret.sale_id,
    'bill_no', v_sale.bill_no,
    'date_time', v_ret.created_at,
    'refund_method', v_ret.refund_method,
    'refund_cents', v_ret.refund_cents,
    'reason', v_ret.reason,
    'restock', v_ret.restock,
    'shop', jsonb_build_object(
      'name', v_shop.shop_name,
      'address', v_shop.address,
      'phone', v_shop.phone
    ),
    'cashier', jsonb_build_object(
      'id', v_cashier.id,
      'name', v_cashier.name
    ),
    'customer', CASE WHEN v_sale.customer_id IS NOT NULL THEN
      jsonb_build_object(
        'id', v_sale.customer_id,
        'phone', v_sale.customer_phone
      )
      ELSE NULL END,
    'lines', COALESCE(v_lines, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.x_report(p_shift_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_shift record;
  v_cash_payments bigint := 0;
  v_change_given bigint := 0;
  v_cash_sales bigint := 0;
  v_card_sales bigint := 0;
  v_transfer_sales bigint := 0;
  v_credit_sales bigint := 0;
  v_cash_refunds bigint := 0;
  v_cash_in bigint := 0;
  v_cash_out bigint := 0;
  v_expected_cash bigint := 0;
  v_sales_count int := 0;
  v_cashier_name text;
BEGIN
  v_user_id := public.resolve_caller_uid();
  IF v_user_id IS NULL OR NOT is_staff() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF p_shift_id IS NOT NULL THEN
    SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id;
    IF v_shift.id IS NOT NULL AND v_shift.cashier_id IS DISTINCT FROM v_user_id AND NOT is_manager_or_owner() THEN
      RAISE EXCEPTION 'NOT_AUTHORISED: Cannot inspect another cashier''s shift report';
    END IF;
  ELSE
    SELECT * INTO v_shift FROM shifts WHERE cashier_id = v_user_id AND status = 'open' ORDER BY opened_at DESC LIMIT 1;
  END IF;

  IF v_shift.id IS NULL THEN
    RAISE EXCEPTION 'NO_OPEN_SHIFT';
  END IF;

  SELECT full_name INTO v_cashier_name FROM profiles WHERE id = v_shift.cashier_id;

  SELECT count(*) INTO v_sales_count
  FROM sales
  WHERE shift_id = v_shift.id AND status != 'voided';

  SELECT COALESCE(sum(p.amount_cents), 0) INTO v_cash_payments
  FROM payments p
  JOIN sales s ON p.sale_id = s.id
  WHERE s.shift_id = v_shift.id AND s.status != 'voided' AND p.method = 'cash';

  SELECT COALESCE(sum(s.change_cents), 0) INTO v_change_given
  FROM sales s
  WHERE s.shift_id = v_shift.id AND s.status != 'voided';

  v_cash_sales := v_cash_payments - v_change_given;

  SELECT COALESCE(sum(p.amount_cents), 0) INTO v_card_sales
  FROM payments p
  JOIN sales s ON p.sale_id = s.id
  WHERE s.shift_id = v_shift.id AND s.status != 'voided' AND p.method = 'card';

  SELECT COALESCE(sum(p.amount_cents), 0) INTO v_transfer_sales
  FROM payments p
  JOIN sales s ON p.sale_id = s.id
  WHERE s.shift_id = v_shift.id AND s.status != 'voided' AND p.method = 'bank_transfer';

  SELECT COALESCE(sum(p.amount_cents), 0) INTO v_credit_sales
  FROM payments p
  JOIN sales s ON p.sale_id = s.id
  WHERE s.shift_id = v_shift.id AND s.status != 'voided' AND p.method = 'store_credit';

  SELECT COALESCE(sum(r.refund_cents), 0) INTO v_cash_refunds
  FROM sale_returns r
  WHERE r.shift_id = v_shift.id AND r.refund_method = 'cash';

  SELECT COALESCE(sum(amount_cents), 0) INTO v_cash_in
  FROM cash_movements WHERE shift_id = v_shift.id AND kind = 'cash_in';

  SELECT COALESCE(sum(amount_cents), 0) INTO v_cash_out
  FROM cash_movements WHERE shift_id = v_shift.id AND kind = 'cash_out';

  v_expected_cash := v_shift.opening_float_cents + v_cash_sales - v_cash_refunds + v_cash_in - v_cash_out;

  RETURN jsonb_build_object(
    'shift_id', v_shift.id,
    'terminal_name', v_shift.terminal_name,
    'cashier_name', COALESCE(v_cashier_name, 'Cashier'),
    'status', v_shift.status,
    'opened_at', v_shift.opened_at,
    'generated_at', now(),
    'opening_float_cents', v_shift.opening_float_cents,
    'sales_count', v_sales_count,
    'cash_sales_cents', v_cash_sales,
    'card_sales_cents', v_card_sales,
    'transfer_sales_cents', v_transfer_sales,
    'credit_sales_cents', v_credit_sales,
    'cash_refunds_cents', v_cash_refunds,
    'cash_in_cents', v_cash_in,
    'cash_out_cents', v_cash_out,
    'expected_cash_cents', v_expected_cash
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_cash_movement(
  p_shift_id uuid,
  p_kind text,
  p_amount_cents bigint,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_movement_id uuid;
  v_shift record;
  v_clean_reason text;
BEGIN
  v_user_id := public.resolve_caller_uid();
  IF v_user_id IS NULL OR NOT is_staff() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF p_kind NOT IN ('cash_in', 'cash_out') THEN
    RAISE EXCEPTION 'INVALID_INPUT: Kind must be cash_in or cash_out';
  END IF;

  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Amount must be greater than zero';
  END IF;

  v_clean_reason := trim(COALESCE(p_reason, ''));
  IF length(v_clean_reason) < 3 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Reason is mandatory (at least 3 characters)';
  END IF;

  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIFT_NOT_FOUND_OR_CLOSED';
  END IF;

  IF v_shift.cashier_id IS DISTINCT FROM v_user_id AND NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Cannot record cash movement on another cashier''s shift';
  END IF;

  INSERT INTO cash_movements (
    shift_id,
    kind,
    amount_cents,
    reason,
    created_by,
    created_at
  ) VALUES (
    p_shift_id,
    p_kind,
    p_amount_cents,
    v_clean_reason,
    v_user_id,
    now()
  ) RETURNING id INTO v_movement_id;

  INSERT INTO audit_log (user_id, action, table_name, record_id, new_data)
  VALUES (
    v_user_id,
    'cash_movement.' || p_kind,
    'cash_movements',
    v_movement_id::text,
    jsonb_build_object(
      'shift_id', p_shift_id,
      'kind', p_kind,
      'amount_cents', p_amount_cents,
      'reason', v_clean_reason
    )
  );

  RETURN jsonb_build_object(
    'id', v_movement_id,
    'shift_id', p_shift_id,
    'kind', p_kind,
    'amount_cents', p_amount_cents,
    'reason', v_clean_reason,
    'created_at', now()
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. VULN-001 & VULN-002: VALIDATE & DEDUCT store_credit IN create_sale(); AUTHORIZE LEDGER WRITES IN create_sale, void_sale, create_return
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_sale(
  p_idempotency_key uuid,
  p_items jsonb,
  p_bill_discount jsonb,
  p_payments jsonb,
  p_customer_phone text DEFAULT NULL,
  p_customer_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_user_role user_role;
  v_user_active boolean;
  v_existing_sale_id uuid;
  v_calc jsonb;
  v_subtotal_cents bigint;
  v_line_discounts_total bigint;
  v_bill_discount_cents bigint;
  v_total_cents bigint;
  v_taxable_cents bigint;
  v_tax_cents_total bigint;
  v_tax_rate numeric(5,2);
  v_calc_lines jsonb;
  v_shop record;
  v_paid_cents bigint := 0;
  v_cash_cents bigint := 0;
  v_non_cash_cents bigint := 0;
  v_store_credit_cents bigint := 0;
  v_cust_credit bigint := 0;
  v_change_cents bigint := 0;
  v_remaining_after_cash bigint;
  v_pay_elem jsonb;
  v_pay_amount bigint;
  v_pay_method payment_method;
  v_colombo_date date;
  v_bill_seq int;
  v_bill_no text;
  v_customer_id uuid := NULL;
  v_customer_sms_opt_out boolean := false;
  v_norm_phone text := NULL;
  v_shift_id uuid := NULL;
  v_sale_id uuid;
  v_sale_item_id uuid;
  v_line_elem jsonb;
  v_sms_body text;
  v_batch_needed numeric(12,3);
  v_batch_deducted numeric(12,3);
  v_batch record;
  v_prod_stock numeric(12,3);
  v_track_exp boolean;
  v_points_earned int := 0;
BEGIN
  PERFORM set_config('app.in_create_sale', 'true', true);

  v_user_id := public.resolve_caller_uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  SELECT role, is_active INTO v_user_role, v_user_active
  FROM profiles
  WHERE id = v_user_id;

  IF NOT FOUND OR NOT v_user_active THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT:idempotency_key is required';
  END IF;

  SELECT id INTO v_existing_sale_id
  FROM sales
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN get_bill(v_existing_sale_id);
  END IF;

  SELECT id INTO v_shift_id
  FROM shifts
  WHERE cashier_id = v_user_id AND status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  IF v_shift_id IS NULL THEN
    IF current_user IN ('postgres', 'supabase_admin')
       AND NULLIF(current_setting('request.jwt.claims', true), '') IS NULL
       AND current_setting('app.skip_shift_check', true) = 'true' THEN
      INSERT INTO shifts (cashier_id, terminal_name, status, opening_float_cents)
      VALUES (v_user_id, 'Automated Test Terminal', 'open', 0)
      RETURNING id INTO v_shift_id;
    ELSE
      RAISE EXCEPTION 'NO_OPEN_SHIFT';
    END IF;
  END IF;

  v_calc := calc_bill(p_items, p_bill_discount, true);

  v_subtotal_cents := (v_calc->>'subtotal_cents')::bigint;
  v_line_discounts_total := (v_calc->>'line_discount_cents')::bigint;
  v_bill_discount_cents := (v_calc->>'bill_discount_cents')::bigint;
  v_total_cents := (v_calc->>'total_cents')::bigint;
  v_taxable_cents := (v_calc->'tax'->>'taxable_cents')::bigint;
  v_tax_cents_total := (v_calc->'tax'->>'tax_cents')::bigint;
  v_tax_rate := (v_calc->'tax'->>'rate_percent')::numeric;
  v_calc_lines := v_calc->'lines';

  SELECT * INTO v_shop FROM shop_settings WHERE id = 1;

  IF p_payments IS NULL OR jsonb_array_length(p_payments) = 0 THEN
    IF v_total_cents > 0 THEN
      RAISE EXCEPTION 'INVALID_PAYMENT:Payment required for non-zero total';
    END IF;
  ELSE
    FOR v_pay_elem IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
      v_pay_amount := (v_pay_elem->>'amount_cents')::bigint;
      IF v_pay_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_PAYMENT:Payment amount must be greater than zero';
      END IF;

      v_pay_method := (v_pay_elem->>'method')::payment_method;
      IF v_pay_method = 'cash' THEN
        v_cash_cents := v_cash_cents + v_pay_amount;
      ELSE
        v_non_cash_cents := v_non_cash_cents + v_pay_amount;
        IF v_pay_method = 'store_credit' THEN
          v_store_credit_cents := v_store_credit_cents + v_pay_amount;
        END IF;
      END IF;

      v_paid_cents := v_paid_cents + v_pay_amount;
    END LOOP;
  END IF;

  IF v_paid_cents < v_total_cents THEN
    RAISE EXCEPTION 'PAYMENT_UNDERPAID:%:%', v_total_cents, v_paid_cents;
  END IF;

  v_remaining_after_cash := GREATEST(0, v_total_cents - v_cash_cents);
  IF v_non_cash_cents > v_remaining_after_cash THEN
    RAISE EXCEPTION 'PAYMENT_EXCEEDS_REMAINING:%:%', v_remaining_after_cash, v_non_cash_cents;
  END IF;

  v_change_cents := v_paid_cents - v_total_cents;

  -- Customer Upsert / Lookup
  IF p_customer_phone IS NOT NULL AND trim(p_customer_phone) <> '' THEN
    v_norm_phone := normalize_phone_number(p_customer_phone);

    INSERT INTO customers (name, phone)
    VALUES (
      COALESCE(NULLIF(trim(p_customer_name), ''), 'Customer ' || right(v_norm_phone, 4)),
      v_norm_phone
    )
    ON CONFLICT (phone) DO UPDATE SET
      name = COALESCE(NULLIF(trim(EXCLUDED.name), ''), customers.name)
    RETURNING id, sms_opt_out INTO v_customer_id, v_customer_sms_opt_out;
  END IF;

  -- VULN-001: Validate and atomically deduct customer store credit if tendered
  IF v_store_credit_cents > 0 THEN
    IF v_customer_id IS NULL THEN
      RAISE EXCEPTION 'CUSTOMER_REQUIRED_FOR_STORE_CREDIT: An identified customer is required to pay with store credit';
    END IF;

    SELECT credit_balance_cents INTO v_cust_credit
    FROM customers
    WHERE id = v_customer_id
    FOR UPDATE;

    IF NOT FOUND OR v_cust_credit < v_store_credit_cents THEN
      RAISE EXCEPTION 'INSUFFICIENT_STORE_CREDIT: Available credit is % cents but % cents requested',
        COALESCE(v_cust_credit, 0), v_store_credit_cents;
    END IF;

    PERFORM set_config('app.customer_ledger_write', 'on', true);
    UPDATE customers
    SET credit_balance_cents = credit_balance_cents - v_store_credit_cents
    WHERE id = v_customer_id;
  END IF;

  v_colombo_date := (now() AT TIME ZONE 'Asia/Colombo')::date;

  INSERT INTO bill_counters (bill_date, last_number)
  VALUES (v_colombo_date, 1)
  ON CONFLICT (bill_date)
  DO UPDATE SET last_number = bill_counters.last_number + 1
  RETURNING last_number INTO v_bill_seq;

  v_bill_no := 'WWL-' || to_char(v_colombo_date, 'YYYYMMDD') || '-' || lpad(v_bill_seq::text, 4, '0');

  INSERT INTO sales (
    bill_no,
    idempotency_key,
    shift_id,
    cashier_id,
    customer_id,
    customer_phone,
    status,
    subtotal_cents,
    line_discount_cents,
    bill_discount_cents,
    taxable_cents,
    tax_cents,
    total_cents,
    tax_rate_percent_snapshot,
    tax_inclusive_snapshot,
    paid_cents,
    change_cents,
    print_count,
    created_at
  ) VALUES (
    v_bill_no,
    p_idempotency_key,
    v_shift_id,
    v_user_id,
    v_customer_id,
    v_norm_phone,
    'completed',
    v_subtotal_cents,
    v_line_discounts_total,
    v_bill_discount_cents,
    v_taxable_cents,
    v_tax_cents_total,
    v_total_cents,
    v_tax_rate,
    v_shop.tax_inclusive,
    v_paid_cents,
    v_change_cents,
    0,
    now()
  )
  RETURNING id INTO v_sale_id;

  IF v_customer_id IS NOT NULL AND v_shop.loyalty_enabled AND v_shop.loyalty_points_per_100_lkr > 0 THEN
    v_points_earned := floor((v_total_cents::numeric / 10000.0) * v_shop.loyalty_points_per_100_lkr)::int;
    IF v_points_earned > 0 THEN
      INSERT INTO customer_points_ledger (customer_id, sale_id, points, reason)
      VALUES (v_customer_id, v_sale_id, v_points_earned, 'Sale ' || v_bill_no);

      PERFORM set_config('app.customer_ledger_write', 'on', true);
      UPDATE customers
      SET points_balance = points_balance + v_points_earned
      WHERE id = v_customer_id;
    END IF;
  END IF;

  PERFORM set_config('app.stock_write', 'on', true);

  FOR v_line_elem IN SELECT * FROM jsonb_array_elements(v_calc_lines) LOOP
    INSERT INTO sale_items (
      sale_id,
      product_id,
      product_name_snapshot,
      sku_snapshot,
      unit_snapshot,
      quantity,
      unit_price_cents_snapshot,
      unit_cost_cents_snapshot,
      line_discount_cents,
      line_tax_cents,
      line_total_cents,
      created_at
    ) VALUES (
      v_sale_id,
      (v_line_elem->>'product_id')::uuid,
      v_line_elem->>'name',
      v_line_elem->>'sku',
      v_line_elem->>'unit',
      (v_line_elem->>'quantity')::numeric(12,3),
      (v_line_elem->>'unit_price_cents')::bigint,
      (v_line_elem->>'cost_price_cents')::bigint,
      (v_line_elem->>'line_discount_cents')::bigint + (v_line_elem->>'allocated_bill_discount_cents')::bigint,
      (v_line_elem->>'line_tax_cents')::bigint,
      (v_line_elem->>'line_total_cents')::bigint,
      now()
    ) RETURNING id INTO v_sale_item_id;

    UPDATE products
    SET stock_qty = stock_qty - (v_line_elem->>'quantity')::numeric(12,3)
    WHERE id = (v_line_elem->>'product_id')::uuid
    RETURNING stock_qty, track_expiry INTO v_prod_stock, v_track_exp;

    INSERT INTO stock_movements (
      product_id,
      movement_type,
      qty_change,
      qty_after,
      reference_type,
      reference_id,
      reason,
      created_by,
      created_at
    ) VALUES (
      (v_line_elem->>'product_id')::uuid,
      'sale',
      -((v_line_elem->>'quantity')::numeric(12,3)),
      v_prod_stock,
      'sale',
      v_sale_id,
      'Sale ' || v_bill_no,
      v_user_id,
      now()
    );

    IF v_track_exp THEN
      v_batch_needed := (v_line_elem->>'quantity')::numeric(12,3);

      FOR v_batch IN 
        SELECT id, qty_remaining 
        FROM stock_batches 
        WHERE product_id = (v_line_elem->>'product_id')::uuid AND qty_remaining > 0 
        ORDER BY expiry_date ASC, created_at ASC 
        FOR UPDATE
      LOOP
        IF v_batch.qty_remaining >= v_batch_needed THEN
          UPDATE stock_batches 
          SET qty_remaining = qty_remaining - v_batch_needed 
          WHERE id = v_batch.id;

          INSERT INTO sale_item_batches (sale_item_id, batch_id, quantity)
          VALUES (v_sale_item_id, v_batch.id, v_batch_needed);

          v_batch_needed := 0;
          EXIT;
        ELSE
          v_batch_deducted := v_batch.qty_remaining;
          v_batch_needed := v_batch_needed - v_batch_deducted;

          UPDATE stock_batches 
          SET qty_remaining = 0 
          WHERE id = v_batch.id;

          INSERT INTO sale_item_batches (sale_item_id, batch_id, quantity)
          VALUES (v_sale_item_id, v_batch.id, v_batch_deducted);
        END IF;
      END LOOP;

      IF v_batch_needed > 0 THEN
        RAISE EXCEPTION 'BATCH_MISMATCH:%', v_line_elem->>'sku';
      END IF;
    END IF;
  END LOOP;

  IF p_payments IS NOT NULL AND jsonb_array_length(p_payments) > 0 THEN
    FOR v_pay_elem IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
      INSERT INTO payments (
        sale_id,
        method,
        amount_cents,
        reference,
        created_at
      ) VALUES (
        v_sale_id,
        (v_pay_elem->>'method')::payment_method,
        (v_pay_elem->>'amount_cents')::bigint,
        v_pay_elem->>'reference',
        now()
      );
    END LOOP;
  END IF;

  IF v_shop.sms_enabled AND v_norm_phone IS NOT NULL AND NOT v_customer_sms_opt_out THEN
    v_sms_body := replace(
      replace(
        replace(
          COALESCE(v_shop.sms_template, 'Thank you for shopping at {shop_name}. Bill: {bill_no}, Total: {total}.'),
          '{shop_name}', v_shop.shop_name
        ),
        '{bill_no}', v_bill_no
      ),
      '{total}', 'Rs. ' || to_char(v_total_cents / 100.0, 'FM999,999,990.00')
    );

    INSERT INTO sms_outbox (sale_id, phone, message, status)
    VALUES (v_sale_id, v_norm_phone, v_sms_body, 'pending');
  END IF;

  INSERT INTO audit_log (user_id, action, table_name, record_id, new_data)
  VALUES (
    v_user_id,
    'sale.create',
    'sales',
    v_sale_id::text,
    jsonb_build_object(
      'bill_no', v_bill_no,
      'total_cents', v_total_cents,
      'paid_cents', v_paid_cents,
      'store_credit_cents', v_store_credit_cents,
      'points_earned', v_points_earned,
      'shift_id', v_shift_id,
      'items_count', jsonb_array_length(v_calc_lines)
    )
  );

  RETURN get_bill(v_sale_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.void_sale(
  p_sale_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_sale record;
  v_item record;
  v_sib record;
  v_sale_date date;
  v_today_date date;
  v_cleaned_reason text;
  v_new_stock numeric(12,3);
  v_pts int := 0;
  v_credit_used bigint := 0;
BEGIN
  v_user_id := public.resolve_caller_uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can void sales';
  END IF;

  v_cleaned_reason := trim(COALESCE(p_reason, ''));
  IF length(v_cleaned_reason) < 5 THEN
    RAISE EXCEPTION 'REASON_TOO_SHORT: Void reason must be at least 5 characters long';
  END IF;

  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALE_NOT_FOUND';
  END IF;

  IF v_sale.status = 'voided' THEN
    RAISE EXCEPTION 'CANNOT_VOID_TWICE: Sale is already voided';
  END IF;

  IF v_sale.status != 'completed' THEN
    RAISE EXCEPTION 'CANNOT_VOID_SALE: Only completed sales can be voided (status is %)', v_sale.status;
  END IF;

  IF EXISTS (SELECT 1 FROM sale_returns WHERE sale_id = p_sale_id) THEN
    RAISE EXCEPTION 'CANNOT_VOID_RETURNED_SALE: Sale has associated returns and cannot be voided';
  END IF;

  v_sale_date := (v_sale.created_at AT TIME ZONE 'Asia/Colombo')::date;
  v_today_date := (now() AT TIME ZONE 'Asia/Colombo')::date;

  IF v_sale_date != v_today_date THEN
    IF NOT is_owner() THEN
      RAISE EXCEPTION 'CANNOT_VOID_PAST_DAY: Managers can only void sales within the same calendar day. Owner override required.';
    END IF;
    IF NOT is_owner_aal2() THEN
      RAISE EXCEPTION 'MFA_REQUIRED: Voiding a sale from a previous day requires owner authentication with MFA (AAL2).';
    END IF;
  END IF;

  PERFORM set_config('app.stock_write', 'on', true);

  FOR v_item IN SELECT * FROM sale_items WHERE sale_id = p_sale_id LOOP
    UPDATE products
    SET stock_qty = stock_qty + v_item.quantity
    WHERE id = v_item.product_id
    RETURNING stock_qty INTO v_new_stock;

    INSERT INTO stock_movements (
      product_id,
      movement_type,
      qty_change,
      qty_after,
      reference_type,
      reference_id,
      reason,
      created_by,
      created_at
    ) VALUES (
      v_item.product_id,
      'sale_void',
      v_item.quantity,
      v_new_stock,
      'sale',
      p_sale_id,
      'Void bill ' || v_sale.bill_no || ': ' || v_cleaned_reason,
      v_user_id,
      now()
    );

    FOR v_sib IN SELECT * FROM sale_item_batches WHERE sale_item_id = v_item.id LOOP
      UPDATE stock_batches
      SET qty_remaining = qty_remaining + v_sib.quantity
      WHERE id = v_sib.batch_id;
    END LOOP;
  END LOOP;

  -- Reverse Loyalty Points & Store Credit if applicable
  IF v_sale.customer_id IS NOT NULL THEN
    PERFORM set_config('app.customer_ledger_write', 'on', true);

    SELECT COALESCE(sum(points), 0) INTO v_pts
    FROM customer_points_ledger
    WHERE sale_id = p_sale_id AND points > 0;

    IF v_pts > 0 THEN
      UPDATE customers
      SET points_balance = GREATEST(0, points_balance - v_pts)
      WHERE id = v_sale.customer_id;

      INSERT INTO customer_points_ledger (customer_id, sale_id, points, reason)
      VALUES (v_sale.customer_id, p_sale_id, -v_pts, 'Void bill ' || v_sale.bill_no);
    END IF;

    SELECT COALESCE(sum(amount_cents), 0) INTO v_credit_used
    FROM payments
    WHERE sale_id = p_sale_id AND method = 'store_credit';

    IF v_credit_used > 0 THEN
      UPDATE customers
      SET credit_balance_cents = credit_balance_cents + v_credit_used
      WHERE id = v_sale.customer_id;
    END IF;
  END IF;

  UPDATE sales
  SET 
    status = 'voided',
    voided_at = now(),
    voided_by = v_user_id,
    void_reason = v_cleaned_reason
  WHERE id = p_sale_id;

  INSERT INTO audit_log (user_id, action, table_name, record_id, new_data)
  VALUES (
    v_user_id,
    'sale.void',
    'sales',
    p_sale_id::text,
    jsonb_build_object(
      'bill_no', v_sale.bill_no,
      'total_cents', v_sale.total_cents,
      'reason', v_cleaned_reason
    )
  );

  RETURN get_bill(p_sale_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_return(
  p_sale_id uuid,
  p_items jsonb,
  p_reason text,
  p_refund_method payment_method,
  p_restock boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_sale record;
  v_item_elem jsonb;
  v_sale_item_id uuid;
  v_req_qty numeric(12,3);
  v_sale_item record;
  v_already_ret_qty numeric(12,3);
  v_already_ref_cents bigint;
  v_rem_qty numeric(12,3);
  v_line_refund bigint;
  v_total_refund_cents bigint := 0;
  v_total_paid_cents bigint := 0;
  v_already_total_refunded bigint := 0;
  v_return_id uuid;
  v_colombo_date date;
  v_ret_seq int;
  v_return_no text;
  v_cleaned_reason text;
  v_shift_id uuid := NULL;
  v_new_stock numeric(12,3);
  v_sib record;
  v_restore_needed numeric(12,3);
  v_all_returned boolean;
  v_return_lines jsonb := '[]'::jsonb;
BEGIN
  v_user_id := public.resolve_caller_uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can process sale returns';
  END IF;

  v_cleaned_reason := trim(COALESCE(p_reason, ''));
  IF length(v_cleaned_reason) < 3 THEN
    RAISE EXCEPTION 'REASON_REQUIRED: Return reason is mandatory';
  END IF;

  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALE_NOT_FOUND';
  END IF;

  IF v_sale.status = 'voided' THEN
    RAISE EXCEPTION 'CANNOT_RETURN_VOIDED_SALE: A voided bill cannot be returned';
  END IF;

  IF p_refund_method = 'store_credit' AND v_sale.customer_id IS NULL THEN
    RAISE EXCEPTION 'CUSTOMER_REQUIRED_FOR_STORE_CREDIT: Store credit refunds require an identified customer profile';
  END IF;

  SELECT id INTO v_shift_id
  FROM shifts
  WHERE cashier_id = v_user_id AND status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  IF p_refund_method = 'cash' AND v_shift_id IS NULL THEN
    IF current_user IN ('postgres', 'supabase_admin')
       AND NULLIF(current_setting('request.jwt.claims', true), '') IS NULL
       AND current_setting('app.skip_shift_check', true) = 'true' THEN
      INSERT INTO shifts (cashier_id, terminal_name, status, opening_float_cents)
      VALUES (v_user_id, 'Automated Test Terminal', 'open', 0)
      RETURNING id INTO v_shift_id;
    ELSE
      RAISE EXCEPTION 'NO_OPEN_SHIFT: A cashier shift must be open to disburse cash refunds';
    END IF;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: At least one item must be returned';
  END IF;

  v_colombo_date := (now() AT TIME ZONE 'Asia/Colombo')::date;

  INSERT INTO return_counters (return_date, last_number)
  VALUES (v_colombo_date, 1)
  ON CONFLICT (return_date)
  DO UPDATE SET last_number = return_counters.last_number + 1
  RETURNING last_number INTO v_ret_seq;

  v_return_no := 'RET-' || to_char(v_colombo_date, 'YYYYMMDD') || '-' || lpad(v_ret_seq::text, 4, '0');

  INSERT INTO sale_returns (
    sale_id,
    shift_id,
    return_no,
    reason,
    refund_method,
    refund_cents,
    restock,
    created_by,
    created_at
  ) VALUES (
    p_sale_id,
    v_shift_id,
    v_return_no,
    v_cleaned_reason,
    p_refund_method,
    0,
    p_restock,
    v_user_id,
    now()
  ) RETURNING id INTO v_return_id;

  FOR v_item_elem IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_sale_item_id := (v_item_elem->>'sale_item_id')::uuid;
    v_req_qty := (v_item_elem->>'quantity')::numeric(12,3);

    IF v_req_qty <= 0 THEN
      RAISE EXCEPTION 'INVALID_RETURN_QTY: Return quantity must be greater than zero';
    END IF;

    SELECT * INTO v_sale_item
    FROM sale_items
    WHERE id = v_sale_item_id AND sale_id = p_sale_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SALE_ITEM_NOT_FOUND:%', v_sale_item_id;
    END IF;

    SELECT 
      COALESCE(sum(sri.quantity), 0),
      COALESCE(sum(sri.refund_cents), 0)
    INTO v_already_ret_qty, v_already_ref_cents
    FROM sale_return_items sri
    JOIN sale_returns sr ON sri.return_id = sr.id
    WHERE sri.sale_item_id = v_sale_item_id;

    v_rem_qty := v_sale_item.quantity - v_already_ret_qty;

    IF v_req_qty > v_rem_qty THEN
      RAISE EXCEPTION 'RETURN_QTY_EXCEEDED: Requested return qty % exceeds returnable qty % for %',
        v_req_qty, v_rem_qty, v_sale_item.sku_snapshot;
    END IF;

    IF (v_already_ret_qty + v_req_qty) = v_sale_item.quantity THEN
      v_line_refund := v_sale_item.line_total_cents - v_already_ref_cents;
    ELSE
      v_line_refund := round_half_up(v_sale_item.line_total_cents * v_req_qty, v_sale_item.quantity);
    END IF;

    v_total_refund_cents := v_total_refund_cents + v_line_refund;

    INSERT INTO sale_return_items (
      return_id,
      sale_item_id,
      quantity,
      refund_cents,
      created_at
    ) VALUES (
      v_return_id,
      v_sale_item_id,
      v_req_qty,
      v_line_refund,
      now()
    );

    v_return_lines := v_return_lines || jsonb_build_object(
      'sale_item_id', v_sale_item_id,
      'product_name', v_sale_item.product_name_snapshot,
      'sku', v_sale_item.sku_snapshot,
      'quantity', v_req_qty,
      'unit', v_sale_item.unit_snapshot,
      'refund_cents', v_line_refund
    );

    IF p_restock THEN
      PERFORM set_config('app.stock_write', 'on', true);
      UPDATE products
      SET stock_qty = stock_qty + v_req_qty
      WHERE id = v_sale_item.product_id
      RETURNING stock_qty INTO v_new_stock;

      INSERT INTO stock_movements (
        product_id,
        movement_type,
        qty_change,
        qty_after,
        reference_type,
        reference_id,
        reason,
        created_by,
        created_at
      ) VALUES (
        v_sale_item.product_id,
        'return',
        v_req_qty,
        v_new_stock,
        'return',
        v_return_id,
        'Return ' || v_return_no || ': ' || v_cleaned_reason,
        v_user_id,
        now()
      );

      v_restore_needed := v_req_qty;
      FOR v_sib IN 
        SELECT sib.batch_id, sib.quantity 
        FROM sale_item_batches sib 
        WHERE sib.sale_item_id = v_sale_item_id 
        ORDER BY sib.created_at DESC 
      LOOP
        IF v_restore_needed <= 0 THEN
          EXIT;
        END IF;

        IF v_sib.quantity >= v_restore_needed THEN
          UPDATE stock_batches
          SET qty_remaining = qty_remaining + v_restore_needed
          WHERE id = v_sib.batch_id;
          v_restore_needed := 0;
        ELSE
          UPDATE stock_batches
          SET qty_remaining = qty_remaining + v_sib.quantity
          WHERE id = v_sib.batch_id;
          v_restore_needed := v_restore_needed - v_sib.quantity;
        END IF;
      END LOOP;
    ELSE
      SELECT stock_qty INTO v_new_stock FROM products WHERE id = v_sale_item.product_id;

      INSERT INTO stock_movements (
        product_id,
        movement_type,
        qty_change,
        qty_after,
        reference_type,
        reference_id,
        reason,
        created_by,
        created_at
      ) VALUES (
        v_sale_item.product_id,
        'damage',
        0,
        v_new_stock,
        'return_damaged',
        v_return_id,
        'Damaged Return ' || v_return_no || ' (no restock): ' || v_cleaned_reason,
        v_user_id,
        now()
      );
    END IF;
  END LOOP;

  SELECT COALESCE(sum(refund_cents), 0) INTO v_already_total_refunded
  FROM sale_returns
  WHERE sale_id = p_sale_id AND id != v_return_id;

  v_total_paid_cents := v_sale.paid_cents - v_sale.change_cents;
  IF (v_already_total_refunded + v_total_refund_cents) > v_total_paid_cents THEN
    RAISE EXCEPTION 'REFUND_EXCEEDS_PAID: Cumulative refund exceeds net paid amount for this sale';
  END IF;

  UPDATE sale_returns
  SET refund_cents = v_total_refund_cents
  WHERE id = v_return_id;

  IF p_refund_method = 'store_credit' THEN
    PERFORM set_config('app.customer_ledger_write', 'on', true);
    UPDATE customers
    SET credit_balance_cents = credit_balance_cents + v_total_refund_cents
    WHERE id = v_sale.customer_id;
  END IF;

  SELECT bool_and(total_returned >= quantity) INTO v_all_returned
  FROM (
    SELECT si.id, si.quantity, COALESCE(sum(sri.quantity), 0) as total_returned
    FROM sale_items si
    LEFT JOIN sale_return_items sri ON si.id = sri.sale_item_id
    WHERE si.sale_id = p_sale_id
    GROUP BY si.id, si.quantity
  ) lines_summary;

  IF v_all_returned THEN
    UPDATE sales SET status = 'returned' WHERE id = p_sale_id;
  ELSE
    UPDATE sales SET status = 'partially_returned' WHERE id = p_sale_id;
  END IF;

  INSERT INTO audit_log (user_id, action, table_name, record_id, new_data)
  VALUES (
    v_user_id,
    'sale.return',
    'sale_returns',
    v_return_id::text,
    jsonb_build_object(
      'sale_id', p_sale_id,
      'bill_no', v_sale.bill_no,
      'return_no', v_return_no,
      'refund_cents', v_total_refund_cents,
      'refund_method', p_refund_method,
      'restock', p_restock,
      'reason', v_cleaned_reason,
      'items', v_return_lines
    )
  );

  RETURN jsonb_build_object(
    'return_id', v_return_id,
    'return_no', v_return_no,
    'sale_id', p_sale_id,
    'bill_no', v_sale.bill_no,
    'date_time', now(),
    'reason', v_cleaned_reason,
    'refund_method', p_refund_method,
    'refund_cents', v_total_refund_cents,
    'restock', p_restock,
    'lines', v_return_lines
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. VULN-016: BOUND BULK IMPORT, BULK STOCKTAKE, AND REPORT INPUTS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bulk_import_products(p_products jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := public.resolve_caller_uid();
  v_item jsonb;
  v_sku text;
  v_barcode text;
  v_name text;
  v_category_id uuid;
  v_unit text;
  v_allow_decimal boolean;
  v_cost_cents bigint;
  v_selling_cents bigint;
  v_tax_exempt boolean;
  v_reorder_level numeric(12,3);
  v_track_expiry boolean;
  v_opening_stock numeric(12,3);
  v_new_id uuid;
  v_imported_count int := 0;
  v_row_idx int := 0;
BEGIN
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF p_products IS NULL OR jsonb_array_length(p_products) = 0 THEN
    RAISE EXCEPTION 'NO_ITEMS:Import payload contains no products';
  END IF;

  IF jsonb_array_length(p_products) > 1000 THEN
    RAISE EXCEPTION 'PAYLOAD_TOO_LARGE:Maximum 1000 products allowed per import batch';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_products) LOOP
    v_row_idx := v_row_idx + 1;

    v_sku := trim(COALESCE(v_item->>'sku', ''));
    v_barcode := NULLIF(trim(COALESCE(v_item->>'barcode', '')), '');
    v_name := trim(COALESCE(v_item->>'name', ''));
    v_category_id := (v_item->>'category_id')::uuid;
    v_unit := trim(COALESCE(v_item->>'unit', 'pcs'));
    v_allow_decimal := COALESCE((v_item->>'allow_decimal_qty')::boolean, v_unit IN ('kg', 'g', 'l', 'ml'));
    v_cost_cents := COALESCE((v_item->>'cost_price_cents')::bigint, 0);
    v_selling_cents := (v_item->>'selling_price_cents')::bigint;
    v_tax_exempt := COALESCE((v_item->>'tax_exempt')::boolean, false);
    v_reorder_level := COALESCE((v_item->>'reorder_level')::numeric, 0);
    v_track_expiry := COALESCE((v_item->>'track_expiry')::boolean, false);
    v_opening_stock := COALESCE((v_item->>'opening_stock_qty')::numeric, 0);

    IF v_sku = '' THEN
      RAISE EXCEPTION 'Row %: SKU is required', v_row_idx;
    END IF;
    IF v_name = '' THEN
      RAISE EXCEPTION 'Row % (SKU: %): Product name is required', v_row_idx, v_sku;
    END IF;
    IF v_category_id IS NULL THEN
      RAISE EXCEPTION 'Row % (SKU: %): Valid category is required', v_row_idx, v_sku;
    END IF;
    IF v_unit NOT IN ('pcs', 'kg', 'g', 'l', 'ml', 'pack', 'box') THEN
      RAISE EXCEPTION 'Row % (SKU: %): Invalid unit "%"', v_row_idx, v_sku, v_unit;
    END IF;
    IF v_selling_cents IS NULL OR v_selling_cents < 0 THEN
      RAISE EXCEPTION 'Row % (SKU: %): Selling price must be a non-negative amount', v_row_idx, v_sku;
    END IF;
    IF v_cost_cents < 0 THEN
      RAISE EXCEPTION 'Row % (SKU: %): Cost price cannot be negative', v_row_idx, v_sku;
    END IF;
    IF v_opening_stock < 0 THEN
      RAISE EXCEPTION 'Row % (SKU: %): Opening stock cannot be negative', v_row_idx, v_sku;
    END IF;
    IF NOT v_allow_decimal AND v_opening_stock <> floor(v_opening_stock) THEN
      RAISE EXCEPTION 'Row % (SKU: %): Decimal opening quantity not allowed for unit "%"', v_row_idx, v_sku, v_unit;
    END IF;
    IF EXISTS (SELECT 1 FROM products WHERE sku = v_sku) THEN
      RAISE EXCEPTION 'Row %: Product SKU "%" already exists in database', v_row_idx, v_sku;
    END IF;
    IF v_barcode IS NOT NULL AND EXISTS (SELECT 1 FROM products WHERE barcode = v_barcode) THEN
      RAISE EXCEPTION 'Row %: Barcode "%" already assigned to another product', v_row_idx, v_barcode;
    END IF;

    INSERT INTO products (
      sku, barcode, name, category_id, unit, allow_decimal_qty,
      cost_price_cents, selling_price_cents, tax_exempt, stock_qty,
      reorder_level, track_expiry, is_active
    ) VALUES (
      v_sku, v_barcode, v_name, v_category_id, v_unit, v_allow_decimal,
      v_cost_cents, v_selling_cents, v_tax_exempt, 0,
      v_reorder_level, v_track_expiry, true
    ) RETURNING id INTO v_new_id;

    IF v_opening_stock > 0 THEN
      PERFORM adjust_stock(v_new_id, v_opening_stock, 'Opening Stock Import', 'opening');
    END IF;

    v_imported_count := v_imported_count + 1;
  END LOOP;

  INSERT INTO audit_log (user_id, action, table_name, record_id, new_data, created_at)
  VALUES (v_user_id, 'product.bulk_import', 'products', NULL, jsonb_build_object('count', v_imported_count), now());

  RETURN jsonb_build_object('success', true, 'imported_count', v_imported_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_stocktake(p_adjustments jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item jsonb;
  v_prod_id uuid;
  v_counted numeric(12,3);
  v_note text;
  v_current_stock numeric(12,3);
  v_sku text;
  v_diff numeric(12,3);
  v_adjusted_count int := 0;
BEGIN
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF p_adjustments IS NULL OR jsonb_array_length(p_adjustments) > 1000 THEN
    RAISE EXCEPTION 'PAYLOAD_TOO_LARGE:Maximum 1000 items allowed per stocktake batch';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_adjustments) LOOP
    v_prod_id := (v_item->>'product_id')::uuid;
    v_counted := (v_item->>'counted_qty')::numeric;
    v_note := COALESCE(trim(v_item->>'note'), 'Physical Stocktake Count');

    IF v_counted < 0 THEN
      RAISE EXCEPTION 'Counted quantity cannot be negative';
    END IF;

    SELECT stock_qty, sku INTO v_current_stock, v_sku
    FROM products
    WHERE id = v_prod_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found', v_prod_id;
    END IF;

    v_diff := v_counted - v_current_stock;

    IF v_diff <> 0 THEN
      PERFORM adjust_stock(v_prod_id, v_diff, v_note, 'stocktake');
      v_adjusted_count := v_adjusted_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'adjusted_items_count', v_adjusted_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.report_dead_stock(p_days int DEFAULT 30)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  sku text,
  category_name text,
  stock_qty numeric(12,3),
  valuation_at_cost_cents bigint,
  last_sold_at timestamptz,
  days_since_last_sale int
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_days int := GREATEST(1, LEAST(COALESCE(p_days, 30), 3650));
  v_cutoff timestamptz := now() - (v_days || ' days')::interval;
BEGIN
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can access reports';
  END IF;

  RETURN QUERY
  WITH recent_sales AS (
    SELECT si.product_id, max(s.created_at) AS max_sold_at
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    WHERE s.status != 'voided'
    GROUP BY si.product_id
  )
  SELECT
    p.id AS product_id,
    p.name AS product_name,
    p.sku,
    c.name AS category_name,
    p.stock_qty,
    round((p.stock_qty * p.cost_price_cents)::numeric)::bigint AS valuation_at_cost_cents,
    rs.max_sold_at AS last_sold_at,
    coalesce(EXTRACT(DAY FROM now() - rs.max_sold_at)::int, 999) AS days_since_last_sale
  FROM products p
  JOIN categories c ON p.category_id = c.id
  LEFT JOIN recent_sales rs ON p.id = rs.product_id
  WHERE p.is_active = true
    AND p.stock_qty > 0
    AND (rs.max_sold_at IS NULL OR rs.max_sold_at < v_cutoff)
  ORDER BY valuation_at_cost_cents DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_expiry(p_days int DEFAULT 30)
RETURNS TABLE (
  batch_id uuid,
  product_id uuid,
  product_name text,
  sku text,
  batch_no text,
  expiry_date date,
  qty_remaining numeric(12,3),
  days_until_expiry int,
  cost_price_cents bigint,
  valuation_at_cost_cents bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_days int := GREATEST(1, LEAST(COALESCE(p_days, 30), 3650));
  v_cutoff_date date := current_date + v_days;
BEGIN
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can access reports';
  END IF;

  RETURN QUERY
  SELECT
    sb.id AS batch_id,
    p.id AS product_id,
    p.name AS product_name,
    p.sku,
    sb.batch_no,
    sb.expiry_date,
    sb.qty_remaining,
    (sb.expiry_date - current_date)::int AS days_until_expiry,
    p.cost_price_cents,
    round((sb.qty_remaining * p.cost_price_cents)::numeric)::bigint AS valuation_at_cost_cents
  FROM stock_batches sb
  JOIN products p ON sb.product_id = p.id
  WHERE sb.qty_remaining > 0
    AND sb.expiry_date <= v_cutoff_date
  ORDER BY sb.expiry_date ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_top_customers(
  p_from date,
  p_to date,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  customer_id uuid,
  name text,
  phone text,
  bill_count int,
  total_spent_cents bigint,
  points_balance int
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 20), 500));
BEGIN
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can access reports';
  END IF;

  SELECT v_start_ts, v_end_ts INTO v_start, v_end FROM get_colombo_bounds(p_from, p_to);

  RETURN QUERY
  SELECT
    c.id AS customer_id,
    c.name,
    c.phone,
    count(s.id)::int AS bill_count,
    coalesce(sum(s.total_cents), 0)::bigint AS total_spent_cents,
    c.points_balance
  FROM customers c
  JOIN sales s ON c.id = s.customer_id
  WHERE s.created_at >= v_start
    AND s.created_at < v_end
    AND s.status != 'voided'
  GROUP BY c.id, c.name, c.phone, c.points_balance
  ORDER BY total_spent_cents DESC
  LIMIT v_limit;
END;
$$;

-- ------------------------------------------------------------------------------
-- 10. VULN-017: HARDEN AUDIT TRIGGER IP LOGGING & ADD SECURITY LOGGING RPCs
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_products_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := public.resolve_caller_uid();
  v_ip text := public.get_audit_ip();
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.selling_price_cents IS DISTINCT FROM NEW.selling_price_cents OR OLD.cost_price_cents IS DISTINCT FROM NEW.cost_price_cents THEN
      INSERT INTO public.audit_log (
        user_id, action, table_name, record_id, old_data, new_data, ip_address
      ) VALUES (
        v_user_id,
        CASE 
          WHEN OLD.selling_price_cents IS DISTINCT FROM NEW.selling_price_cents AND OLD.cost_price_cents IS DISTINCT FROM NEW.cost_price_cents THEN 'PRICE_AND_COST_CHANGE'
          WHEN OLD.selling_price_cents IS DISTINCT FROM NEW.selling_price_cents THEN 'PRICE_CHANGE'
          ELSE 'COST_CHANGE'
        END,
        'products',
        NEW.id::text,
        jsonb_build_object('selling_price_cents', OLD.selling_price_cents, 'cost_price_cents', OLD.cost_price_cents, 'sku', OLD.sku, 'name', OLD.name),
        jsonb_build_object('selling_price_cents', NEW.selling_price_cents, 'cost_price_cents', NEW.cost_price_cents, 'sku', NEW.sku, 'name', NEW.name),
        v_ip
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_shop_settings_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := public.resolve_caller_uid();
  v_ip text := public.get_audit_ip();
BEGIN
  INSERT INTO public.audit_log (
    user_id, action, table_name, record_id, old_data, new_data, ip_address
  ) VALUES (
    v_user_id, 'SETTINGS_UPDATE', 'shop_settings', NEW.id::text, to_jsonb(OLD), to_jsonb(NEW), v_ip
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_profiles_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := public.resolve_caller_uid();
  v_ip text := public.get_audit_ip();
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role OR OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    INSERT INTO public.audit_log (
      user_id, action, table_name, record_id, old_data, new_data, ip_address
    ) VALUES (
      v_user_id,
      CASE 
        WHEN OLD.role IS DISTINCT FROM NEW.role AND OLD.is_active IS DISTINCT FROM NEW.is_active THEN 'ROLE_AND_STATUS_CHANGE'
        WHEN OLD.role IS DISTINCT FROM NEW.role THEN 'ROLE_CHANGE'
        ELSE 'STATUS_CHANGE'
      END,
      'profiles',
      NEW.id::text,
      jsonb_build_object('role', OLD.role, 'is_active', OLD.is_active, 'full_name', OLD.full_name),
      jsonb_build_object('role', NEW.role, 'is_active', NEW.is_active, 'full_name', NEW.full_name),
      v_ip
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_categories_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := public.resolve_caller_uid();
  v_ip text := public.get_audit_ip();
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (user_id, action, table_name, record_id, old_data, new_data, ip_address)
    VALUES (v_user_id, 'CATEGORY_UPDATE', 'categories', NEW.id::text, to_jsonb(OLD), to_jsonb(NEW), v_ip);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (user_id, action, table_name, record_id, old_data, new_data, ip_address)
    VALUES (v_user_id, 'CATEGORY_DELETE', 'categories', OLD.id::text, to_jsonb(OLD), null, v_ip);
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_customers_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := public.resolve_caller_uid();
  v_ip text := public.get_audit_ip();
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.phone IS DISTINCT FROM NEW.phone THEN
    INSERT INTO public.audit_log (
      user_id, action, table_name, record_id, old_data, new_data, ip_address
    ) VALUES (
      v_user_id, 'CUSTOMER_PHONE_CHANGE', 'customers', NEW.id::text,
      jsonb_build_object('name', OLD.name, 'phone', OLD.phone),
      jsonb_build_object('name', NEW.name, 'phone', NEW.phone),
      v_ip
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_bill_integrity_error(
  p_sale_id uuid,
  p_bill_no text,
  p_error text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := public.resolve_caller_uid();
BEGIN
  IF v_user_id IS NULL OR NOT is_staff() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  INSERT INTO public.audit_log (user_id, action, table_name, record_id, new_data, ip_address)
  VALUES (
    v_user_id,
    'BILL_INTEGRITY_FAILED',
    'sales',
    COALESCE(p_sale_id::text, 'unknown'),
    jsonb_build_object(
      'bill_no', left(COALESCE(p_bill_no, ''), 64),
      'error', left(COALESCE(p_error, ''), 500),
      'reported_at', now()
    ),
    public.get_audit_ip()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.log_data_export_audit(
  p_export_type text,
  p_record_count int
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := public.resolve_caller_uid();
BEGIN
  IF v_user_id IS NULL OR NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  INSERT INTO public.audit_log (user_id, action, table_name, record_id, new_data, ip_address)
  VALUES (
    v_user_id,
    'DATA_EXPORT',
    left(COALESCE(p_export_type, 'csv'), 64),
    NULL,
    jsonb_build_object('record_count', GREATEST(0, COALESCE(p_record_count, 0))),
    public.get_audit_ip()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_bill_integrity_error(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_bill_integrity_error(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.log_data_export_audit(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_data_export_audit(text, int) TO authenticated;

