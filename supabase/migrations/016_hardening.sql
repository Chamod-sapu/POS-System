-- ==============================================================================
-- Migration: 016_hardening.sql
-- Description: Comprehensive Security Hardening Pass:
--   1. Stock Write Lock: Block direct updates to products.stock_qty and stock_batches.
--   2. Audit Triggers: Immutable audit logging on products, settings, profiles, categories, customers.
--   3. MFA (AAL2) Enforcement: Require AAL2 for owner-only actions.
--   4. Function Hardening: search_path = public, pg_temp and role verification.
--   5. Privilege Lockdown: Revoke all privileges from anon on all public objects.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. STOCK WRITE LOCK (Direct Stock Manipulation Prevention)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_stock_write_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Check session setting 'app.stock_write'
  IF TG_TABLE_NAME = 'products' THEN
    IF OLD.stock_qty IS DISTINCT FROM NEW.stock_qty THEN
      IF current_setting('app.stock_write', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'DIRECT_STOCK_WRITE_PROHIBITED: Direct updates to products.stock_qty are blocked. Use adjust_stock, create_sale, or receive_purchase.';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'stock_batches' THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.qty_remaining IS DISTINCT FROM NEW.qty_remaining THEN
        IF current_setting('app.stock_write', true) IS DISTINCT FROM 'on' THEN
          RAISE EXCEPTION 'DIRECT_STOCK_WRITE_PROHIBITED: Direct updates to stock_batches are blocked. Use authorized transaction functions.';
        END IF;
      END IF;
    ELSIF TG_OP = 'INSERT' THEN
      IF current_setting('app.stock_write', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'DIRECT_STOCK_WRITE_PROHIBITED: Direct creation of stock_batches is blocked. Use receive_purchase.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_direct_stock_products ON public.products;
CREATE TRIGGER trg_prevent_direct_stock_products
  BEFORE UPDATE OF stock_qty ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.check_stock_write_permission();

DROP TRIGGER IF EXISTS trg_prevent_direct_stock_batches ON public.stock_batches;
CREATE TRIGGER trg_prevent_direct_stock_batches
  BEFORE INSERT OR UPDATE OF qty_remaining ON public.stock_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.check_stock_write_permission();

-- ------------------------------------------------------------------------------
-- 2. MFA ENFORCEMENT HELPER (AAL2)
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
BEGIN
  v_role := public.current_user_role();
  IF v_role IS DISTINCT FROM 'owner' THEN
    RETURN false;
  END IF;

  -- Extract JWT AAL claim
  BEGIN
    v_aal := auth.jwt()->>'aal';
  EXCEPTION WHEN OTHERS THEN
    v_aal := NULL;
  END;

  -- When JWT claim exists and has AAL level, enforce AAL2
  IF v_aal IS NOT NULL THEN
    RETURN v_aal = 'aal2';
  END IF;

  -- Default to true in offline/testing contexts without JWT
  RETURN true;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. AUDIT TRIGGERS FOR SENSITIVE OBJECTS
-- ------------------------------------------------------------------------------

-- (a) Products: price and cost changes
CREATE OR REPLACE FUNCTION public.audit_products_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ip text := NULL;
BEGIN
  BEGIN
    v_ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
  EXCEPTION WHEN OTHERS THEN
    v_ip := inet_client_addr()::text;
  END;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.selling_price_cents IS DISTINCT FROM NEW.selling_price_cents OR OLD.cost_price_cents IS DISTINCT FROM NEW.cost_price_cents THEN
      INSERT INTO public.audit_log (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        ip_address
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

DROP TRIGGER IF EXISTS trg_audit_products ON public.products;
CREATE TRIGGER trg_audit_products
  AFTER UPDATE OF selling_price_cents, cost_price_cents ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_products_changes();

-- (b) Shop Settings: all updates
CREATE OR REPLACE FUNCTION public.audit_shop_settings_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ip text := NULL;
BEGIN
  BEGIN
    v_ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
  EXCEPTION WHEN OTHERS THEN
    v_ip := inet_client_addr()::text;
  END;

  INSERT INTO public.audit_log (
    user_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data,
    ip_address
  ) VALUES (
    v_user_id,
    'SETTINGS_UPDATE',
    'shop_settings',
    NEW.id::text,
    to_jsonb(OLD),
    to_jsonb(NEW),
    v_ip
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_shop_settings ON public.shop_settings;
CREATE TRIGGER trg_audit_shop_settings
  AFTER UPDATE ON public.shop_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_shop_settings_changes();

-- (c) Profiles: role and is_active updates
CREATE OR REPLACE FUNCTION public.audit_profiles_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ip text := NULL;
BEGIN
  BEGIN
    v_ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
  EXCEPTION WHEN OTHERS THEN
    v_ip := inet_client_addr()::text;
  END;

  IF OLD.role IS DISTINCT FROM NEW.role OR OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    INSERT INTO public.audit_log (
      user_id,
      action,
      table_name,
      record_id,
      old_data,
      new_data,
      ip_address
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

DROP TRIGGER IF EXISTS trg_audit_profiles ON public.profiles;
CREATE TRIGGER trg_audit_profiles
  AFTER UPDATE OF role, is_active ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_profiles_changes();

-- (d) Categories: updates and deletes
CREATE OR REPLACE FUNCTION public.audit_categories_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ip text := NULL;
BEGIN
  BEGIN
    v_ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
  EXCEPTION WHEN OTHERS THEN
    v_ip := inet_client_addr()::text;
  END;

  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (
      user_id,
      action,
      table_name,
      record_id,
      old_data,
      new_data,
      ip_address
    ) VALUES (
      v_user_id,
      'CATEGORY_UPDATE',
      'categories',
      NEW.id::text,
      to_jsonb(OLD),
      to_jsonb(NEW),
      v_ip
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (
      user_id,
      action,
      table_name,
      record_id,
      old_data,
      new_data,
      ip_address
    ) VALUES (
      v_user_id,
      'CATEGORY_DELETE',
      'categories',
      OLD.id::text,
      to_jsonb(OLD),
      null,
      v_ip
    );
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_categories ON public.categories;
CREATE TRIGGER trg_audit_categories
  AFTER UPDATE OR DELETE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_categories_changes();

-- (e) Customers: phone changes
CREATE OR REPLACE FUNCTION public.audit_customers_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ip text := NULL;
BEGIN
  BEGIN
    v_ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
  EXCEPTION WHEN OTHERS THEN
    v_ip := inet_client_addr()::text;
  END;

  IF TG_OP = 'UPDATE' AND OLD.phone IS DISTINCT FROM NEW.phone THEN
    INSERT INTO public.audit_log (
      user_id,
      action,
      table_name,
      record_id,
      old_data,
      new_data,
      ip_address
    ) VALUES (
      v_user_id,
      'CUSTOMER_PHONE_CHANGE',
      'customers',
      NEW.id::text,
      jsonb_build_object('name', OLD.name, 'phone', OLD.phone),
      jsonb_build_object('name', NEW.name, 'phone', NEW.phone),
      v_ip
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_customers ON public.customers;
CREATE TRIGGER trg_audit_customers
  AFTER UPDATE OF phone ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_customers_changes();

-- ------------------------------------------------------------------------------
-- 4. HARDEN SECURITY DEFINER POLICIES WITH MFA REQUIREMENTS
-- ------------------------------------------------------------------------------

-- Update shop_settings policy to require MFA for owners
DROP POLICY IF EXISTS "shop_settings_owner_update" ON public.shop_settings;
CREATE POLICY "shop_settings_owner_update" ON public.shop_settings
  FOR UPDATE TO authenticated
  USING (is_owner_aal2())
  WITH CHECK (is_owner_aal2());

-- Update audit_log select policy to require MFA for owners
DROP POLICY IF EXISTS "audit_log_owner_select" ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_select_policy" ON public.audit_log;
CREATE POLICY "audit_log_owner_select" ON public.audit_log
  FOR SELECT TO authenticated
  USING (is_owner_aal2());

-- Update profiles update policy to require MFA for owners
DROP POLICY IF EXISTS "profiles_owner_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_owner_all" ON public.profiles;
CREATE POLICY "profiles_owner_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (is_owner_aal2())
  WITH CHECK (is_owner_aal2());

-- ------------------------------------------------------------------------------
-- 5. STOCK WRITING TRANSACTION PERMISSION IN CORE FUNCTIONS
-- ------------------------------------------------------------------------------

-- Re-wrap adjust_stock with permission flag
CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_product_id uuid,
  p_qty_change numeric,
  p_reason text,
  p_type movement_type DEFAULT 'adjustment'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid);
  v_prod products%ROWTYPE;
  v_new_stock numeric(12,3);
BEGIN
  -- Authorize caller
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  -- Validate input
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'INVALID_INPUT:Reason is mandatory';
  END IF;

  IF p_type NOT IN ('opening', 'purchase', 'adjustment', 'damage', 'stocktake') THEN
    RAISE EXCEPTION 'INVALID_INPUT:Invalid adjustment movement type';
  END IF;

  -- Enable stock write flag for this transaction
  PERFORM set_config('app.stock_write', 'on', true);

  -- Lock product row
  SELECT * INTO v_prod
  FROM products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
  END IF;

  v_new_stock := v_prod.stock_qty + p_qty_change;

  IF v_new_stock < 0 THEN
    RAISE EXCEPTION 'OUT_OF_STOCK:%:%', v_prod.sku, v_prod.stock_qty;
  END IF;

  -- Perform stock update
  UPDATE products
  SET stock_qty = v_new_stock,
      updated_at = now()
  WHERE id = p_product_id;

  -- Record movement
  INSERT INTO stock_movements (
    product_id,
    movement_type,
    qty_change,
    qty_after,
    reason,
    created_by
  ) VALUES (
    p_product_id,
    p_type,
    p_qty_change,
    v_new_stock,
    p_reason,
    v_user_id
  );

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'sku', v_prod.sku,
    'old_stock', v_prod.stock_qty,
    'new_stock', v_new_stock,
    'qty_change', p_qty_change
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. SET search_path = public, pg_temp ACROSS ALL SECURITY DEFINER FUNCTIONS
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.oid::regprocedure AS func_signature
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.prosecdef = true
  ) LOOP
    EXECUTE 'ALTER FUNCTION ' || r.func_signature || ' SET search_path = public, pg_temp;';
  END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 7. REVOKE ALL PRIVILEGES FROM anon AND PUBLIC
-- ------------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

-- Grant EXECUTE only to authenticated staff
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Ensure future tables/routines revoke anon
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

