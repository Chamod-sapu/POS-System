-- ==============================================================================
-- Migration: 015_reports.sql
-- Description: Comprehensive Analytical Reporting and Integrity Reconciliation
--              Engine for Managers and Owners.
--              Enforces Asia/Colombo timezone day boundaries, snapshot COGS,
--              gapless audit checks, and high-performance indexing.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. HIGH-PERFORMANCE REPORTING INDEXES
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sales_created_at_status ON public.sales(created_at, status);
CREATE INDEX IF NOT EXISTS idx_sales_status_created_at ON public.sales(status, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_cashier_created_at ON public.sales(cashier_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_customer_created_at ON public.sales(customer_id, created_at);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON public.sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_created_at ON public.sale_items(created_at);

CREATE INDEX IF NOT EXISTS idx_payments_sale_id_method ON public.payments(sale_id, method);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments(created_at);

CREATE INDEX IF NOT EXISTS idx_sale_returns_created_at ON public.sale_returns(created_at);
CREATE INDEX IF NOT EXISTS idx_sale_returns_sale_id ON public.sale_returns(sale_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created ON public.stock_movements(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_batches_expiry_remaining ON public.stock_batches(expiry_date, qty_remaining);
CREATE INDEX IF NOT EXISTS idx_products_active_stock_reorder ON public.products(stock_qty, reorder_level) WHERE is_active = true;

-- ------------------------------------------------------------------------------
-- 2. TIMEZONE & RANGE VALIDATION HELPER
-- Validates date ranges (max 366 days) and converts to Asia/Colombo UTC bounds.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_colombo_bounds(
  p_from date,
  p_to date,
  OUT v_start_ts timestamptz,
  OUT v_end_ts timestamptz
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_to < p_from THEN
    RAISE EXCEPTION 'INVALID_DATE_RANGE: "to" date (%) cannot be before "from" date (%)', p_to, p_from;
  END IF;

  IF (p_to - p_from) > 366 THEN
    RAISE EXCEPTION 'RANGE_TOO_LARGE: Reporting range (%) exceeds maximum limit of 366 days', (p_to - p_from);
  END IF;

  -- Asia/Colombo is UTC+05:30.
  -- Start of p_from at 00:00:00 Colombo time
  v_start_ts := (p_from::text || ' 00:00:00+05:30')::timestamptz;
  -- End bound: start of (p_to + 1) at 00:00:00 Colombo time (exclusive)
  v_end_ts := ((p_to + 1)::text || ' 00:00:00+05:30')::timestamptz;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. FUNCTION report_daily_summary(p_from date, p_to date)
-- Daily sales totals, discounts, taxes, returns and payment method breakdown.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_daily_summary(
  p_from date,
  p_to date
)
RETURNS TABLE (
  report_date date,
  bill_count int,
  gross_sales_cents bigint,
  item_discounts_cents bigint,
  bill_discounts_cents bigint,
  tax_cents bigint,
  net_sales_cents bigint,
  returns_cents bigint,
  final_net_cents bigint,
  cash_cents bigint,
  card_cents bigint,
  bank_transfer_cents bigint,
  store_credit_cents bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can access reports';
  END IF;

  SELECT v_start_ts, v_end_ts INTO v_start, v_end FROM get_colombo_bounds(p_from, p_to);

  RETURN QUERY
  WITH daily_sales AS (
    SELECT
      date(s.created_at AT TIME ZONE 'Asia/Colombo') AS s_date,
      count(s.id)::int AS cnt,
      coalesce(sum(s.subtotal_cents), 0)::bigint AS gross_cents,
      coalesce(sum(s.line_discount_cents), 0)::bigint AS item_disc_cents,
      coalesce(sum(s.bill_discount_cents), 0)::bigint AS bill_disc_cents,
      coalesce(sum(s.tax_cents), 0)::bigint AS total_tax_cents,
      coalesce(sum(s.total_cents), 0)::bigint AS net_cents
    FROM sales s
    WHERE s.created_at >= v_start
      AND s.created_at < v_end
      AND s.status != 'voided'
    GROUP BY date(s.created_at AT TIME ZONE 'Asia/Colombo')
  ),
  daily_returns AS (
    SELECT
      date(sr.created_at AT TIME ZONE 'Asia/Colombo') AS r_date,
      coalesce(sum(sr.refund_cents), 0)::bigint AS total_refund_cents
    FROM sale_returns sr
    WHERE sr.created_at >= v_start
      AND sr.created_at < v_end
    GROUP BY date(sr.created_at AT TIME ZONE 'Asia/Colombo')
  ),
  daily_payments AS (
    SELECT
      date(p.created_at AT TIME ZONE 'Asia/Colombo') AS p_date,
      coalesce(sum(CASE WHEN p.method = 'cash' THEN p.amount_cents ELSE 0 END), 0)::bigint AS cash_pay,
      coalesce(sum(CASE WHEN p.method = 'card' THEN p.amount_cents ELSE 0 END), 0)::bigint AS card_pay,
      coalesce(sum(CASE WHEN p.method = 'bank_transfer' THEN p.amount_cents ELSE 0 END), 0)::bigint AS bt_pay,
      coalesce(sum(CASE WHEN p.method = 'store_credit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS sc_pay
    FROM payments p
    JOIN sales s ON p.sale_id = s.id
    WHERE p.created_at >= v_start
      AND p.created_at < v_end
      AND s.status != 'voided'
    GROUP BY date(p.created_at AT TIME ZONE 'Asia/Colombo')
  ),
  date_series AS (
    SELECT generate_series(p_from, p_to, '1 day'::interval)::date AS d
  )
  SELECT
    ds.d AS report_date,
    coalesce(dsales.cnt, 0)::int AS bill_count,
    coalesce(dsales.gross_cents, 0)::bigint AS gross_sales_cents,
    coalesce(dsales.item_disc_cents, 0)::bigint AS item_discounts_cents,
    coalesce(dsales.bill_disc_cents, 0)::bigint AS bill_discounts_cents,
    coalesce(dsales.total_tax_cents, 0)::bigint AS tax_cents,
    coalesce(dsales.net_cents, 0)::bigint AS net_sales_cents,
    coalesce(dreturns.total_refund_cents, 0)::bigint AS returns_cents,
    (coalesce(dsales.net_cents, 0) - coalesce(dreturns.total_refund_cents, 0))::bigint AS final_net_cents,
    coalesce(dpay.cash_pay, 0)::bigint AS cash_cents,
    coalesce(dpay.card_pay, 0)::bigint AS card_cents,
    coalesce(dpay.bt_pay, 0)::bigint AS bank_transfer_cents,
    coalesce(dpay.sc_pay, 0)::bigint AS store_credit_cents
  FROM date_series ds
  LEFT JOIN daily_sales dsales ON ds.d = dsales.s_date
  LEFT JOIN daily_returns dreturns ON ds.d = dreturns.r_date
  LEFT JOIN daily_payments dpay ON ds.d = dpay.p_date
  ORDER BY ds.d ASC;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. FUNCTION report_sales_by_product(p_from date, p_to date, p_category_id uuid)
-- Granular product sales performance with snapshot COGS, gross profit & margin %.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_sales_by_product(
  p_from date,
  p_to date,
  p_category_id uuid DEFAULT NULL
)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  sku text,
  category_name text,
  quantity_sold numeric(12,3),
  revenue_cents bigint,
  cost_cents bigint,
  profit_cents bigint,
  margin_percent numeric(8,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can access reports';
  END IF;

  SELECT v_start_ts, v_end_ts INTO v_start, v_end FROM get_colombo_bounds(p_from, p_to);

  RETURN QUERY
  SELECT
    si.product_id,
    p.name AS product_name,
    p.sku,
    c.name AS category_name,
    coalesce(sum(si.quantity), 0)::numeric(12,3) AS quantity_sold,
    coalesce(sum(si.line_total_cents), 0)::bigint AS revenue_cents,
    coalesce(sum(round((si.quantity * si.unit_cost_cents_snapshot)::numeric)), 0)::bigint AS cost_cents,
    (coalesce(sum(si.line_total_cents), 0) - coalesce(sum(round((si.quantity * si.unit_cost_cents_snapshot)::numeric)), 0))::bigint AS profit_cents,
    CASE 
      WHEN coalesce(sum(si.line_total_cents), 0) > 0 THEN
        round(
          ((coalesce(sum(si.line_total_cents), 0) - coalesce(sum(round((si.quantity * si.unit_cost_cents_snapshot)::numeric)), 0))::numeric 
          / coalesce(sum(si.line_total_cents), 0)::numeric) * 100,
          2
        )
      ELSE 0.00
    END AS margin_percent
  FROM sale_items si
  JOIN sales s ON si.sale_id = s.id
  JOIN products p ON si.product_id = p.id
  JOIN categories c ON p.category_id = c.id
  WHERE s.created_at >= v_start
    AND s.created_at < v_end
    AND s.status != 'voided'
    AND (p_category_id IS NULL OR p.category_id = p_category_id)
  GROUP BY si.product_id, p.name, p.sku, c.name
  ORDER BY revenue_cents DESC;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. FUNCTION report_sales_by_category(p_from date, p_to date)
-- Category revenue contribution, COGS, and profit margins.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_sales_by_category(
  p_from date,
  p_to date
)
RETURNS TABLE (
  category_id uuid,
  category_name text,
  quantity_sold numeric(12,3),
  revenue_cents bigint,
  cost_cents bigint,
  profit_cents bigint,
  margin_percent numeric(8,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can access reports';
  END IF;

  SELECT v_start_ts, v_end_ts INTO v_start, v_end FROM get_colombo_bounds(p_from, p_to);

  RETURN QUERY
  SELECT
    c.id AS category_id,
    c.name AS category_name,
    coalesce(sum(si.quantity), 0)::numeric(12,3) AS quantity_sold,
    coalesce(sum(si.line_total_cents), 0)::bigint AS revenue_cents,
    coalesce(sum(round((si.quantity * si.unit_cost_cents_snapshot)::numeric)), 0)::bigint AS cost_cents,
    (coalesce(sum(si.line_total_cents), 0) - coalesce(sum(round((si.quantity * si.unit_cost_cents_snapshot)::numeric)), 0))::bigint AS profit_cents,
    CASE 
      WHEN coalesce(sum(si.line_total_cents), 0) > 0 THEN
        round(
          ((coalesce(sum(si.line_total_cents), 0) - coalesce(sum(round((si.quantity * si.unit_cost_cents_snapshot)::numeric)), 0))::numeric 
          / coalesce(sum(si.line_total_cents), 0)::numeric) * 100,
          2
        )
      ELSE 0.00
    END AS margin_percent
  FROM sale_items si
  JOIN sales s ON si.sale_id = s.id
  JOIN products p ON si.product_id = p.id
  JOIN categories c ON p.category_id = c.id
  WHERE s.created_at >= v_start
    AND s.created_at < v_end
    AND s.status != 'voided'
  GROUP BY c.id, c.name
  ORDER BY revenue_cents DESC;
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. FUNCTION report_sales_by_cashier(p_from date, p_to date)
-- Staff throughput, bill volumes, sales generated and return deductions.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_sales_by_cashier(
  p_from date,
  p_to date
)
RETURNS TABLE (
  cashier_id uuid,
  cashier_name text,
  bill_count int,
  revenue_cents bigint,
  discounts_cents bigint,
  returns_cents bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can access reports';
  END IF;

  SELECT v_start_ts, v_end_ts INTO v_start, v_end FROM get_colombo_bounds(p_from, p_to);

  RETURN QUERY
  WITH cashier_sales AS (
    SELECT
      s.cashier_id AS cid,
      count(s.id)::int AS cnt,
      coalesce(sum(s.total_cents), 0)::bigint AS rev,
      coalesce(sum(s.line_discount_cents + s.bill_discount_cents), 0)::bigint AS disc
    FROM sales s
    WHERE s.created_at >= v_start
      AND s.created_at < v_end
      AND s.status != 'voided'
    GROUP BY s.cashier_id
  ),
  cashier_returns AS (
    SELECT
      sr.created_by AS cid,
      coalesce(sum(sr.refund_cents), 0)::bigint AS ret_cents
    FROM sale_returns sr
    WHERE sr.created_at >= v_start
      AND sr.created_at < v_end
    GROUP BY sr.created_by
  )
  SELECT
    p.id AS cashier_id,
    p.full_name AS cashier_name,
    coalesce(cs.cnt, 0)::int AS bill_count,
    coalesce(cs.rev, 0)::bigint AS revenue_cents,
    coalesce(cs.disc, 0)::bigint AS discounts_cents,
    coalesce(cr.ret_cents, 0)::bigint AS returns_cents
  FROM profiles p
  LEFT JOIN cashier_sales cs ON p.id = cs.cid
  LEFT JOIN cashier_returns cr ON p.id = cr.cid
  WHERE coalesce(cs.cnt, 0) > 0 OR coalesce(cr.ret_cents, 0) > 0
  ORDER BY revenue_cents DESC;
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. FUNCTION report_sales_by_hour(p_from date, p_to date)
-- Hourly traffic distribution across 0..23 in Asia/Colombo time for peak charts.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_sales_by_hour(
  p_from date,
  p_to date
)
RETURNS TABLE (
  hour_of_day int,
  bill_count int,
  revenue_cents bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can access reports';
  END IF;

  SELECT v_start_ts, v_end_ts INTO v_start, v_end FROM get_colombo_bounds(p_from, p_to);

  RETURN QUERY
  WITH hours AS (
    SELECT generate_series(0, 23) AS h
  ),
  hourly_agg AS (
    SELECT
      EXTRACT(HOUR FROM s.created_at AT TIME ZONE 'Asia/Colombo')::int AS h,
      count(s.id)::int AS cnt,
      coalesce(sum(s.total_cents), 0)::bigint AS rev
    FROM sales s
    WHERE s.created_at >= v_start
      AND s.created_at < v_end
      AND s.status != 'voided'
    GROUP BY EXTRACT(HOUR FROM s.created_at AT TIME ZONE 'Asia/Colombo')
  )
  SELECT
    hrs.h AS hour_of_day,
    coalesce(ha.cnt, 0)::int AS bill_count,
    coalesce(ha.rev, 0)::bigint AS revenue_cents
  FROM hours hrs
  LEFT JOIN hourly_agg ha ON hrs.h = ha.h
  ORDER BY hrs.h ASC;
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. FUNCTION report_profit(p_from date, p_to date)
-- Profitability overview utilizing historical snapshot COGS.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_profit(
  p_from date,
  p_to date
)
RETURNS TABLE (
  revenue_cents bigint,
  cost_of_goods_cents bigint,
  gross_profit_cents bigint,
  margin_percent numeric(8,2),
  discounts_total_cents bigint,
  returns_total_cents bigint,
  net_profit_cents bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_rev bigint;
  v_cogs bigint;
  v_gross_profit bigint;
  v_margin numeric(8,2);
  v_disc bigint;
  v_returns bigint;
  v_net_profit bigint;
BEGIN
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can access reports';
  END IF;

  SELECT v_start_ts, v_end_ts INTO v_start, v_end FROM get_colombo_bounds(p_from, p_to);

  SELECT
    coalesce(sum(si.line_total_cents), 0),
    coalesce(sum(round((si.quantity * si.unit_cost_cents_snapshot)::numeric)), 0)
  INTO v_rev, v_cogs
  FROM sale_items si
  JOIN sales s ON si.sale_id = s.id
  WHERE s.created_at >= v_start
    AND s.created_at < v_end
    AND s.status != 'voided';

  SELECT
    coalesce(sum(s.line_discount_cents + s.bill_discount_cents), 0)
  INTO v_disc
  FROM sales s
  WHERE s.created_at >= v_start
    AND s.created_at < v_end
    AND s.status != 'voided';

  SELECT
    coalesce(sum(sr.refund_cents), 0)
  INTO v_returns
  FROM sale_returns sr
  WHERE sr.created_at >= v_start
    AND sr.created_at < v_end;

  v_gross_profit := v_rev - v_cogs;
  IF v_rev > 0 THEN
    v_margin := round((v_gross_profit::numeric / v_rev::numeric) * 100, 2);
  ELSE
    v_margin := 0.00;
  END IF;

  v_net_profit := v_gross_profit - v_returns;

  revenue_cents := v_rev;
  cost_of_goods_cents := v_cogs;
  gross_profit_cents := v_gross_profit;
  margin_percent := v_margin;
  discounts_total_cents := v_disc;
  returns_total_cents := v_returns;
  net_profit_cents := v_net_profit;
  RETURN NEXT;
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. FUNCTION report_stock_valuation()
-- Valuation of total active stock holding at cost price and retail price.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_stock_valuation()
RETURNS TABLE (
  product_id uuid,
  product_name text,
  sku text,
  category_name text,
  stock_qty numeric(12,3),
  cost_price_cents bigint,
  selling_price_cents bigint,
  valuation_at_cost_cents bigint,
  valuation_at_selling_cents bigint,
  potential_profit_cents bigint,
  potential_margin_percent numeric(8,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can access reports';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS product_id,
    p.name AS product_name,
    p.sku,
    c.name AS category_name,
    p.stock_qty,
    p.cost_price_cents,
    p.selling_price_cents,
    round((p.stock_qty * p.cost_price_cents)::numeric)::bigint AS valuation_at_cost_cents,
    round((p.stock_qty * p.selling_price_cents)::numeric)::bigint AS valuation_at_selling_cents,
    (round((p.stock_qty * p.selling_price_cents)::numeric) - round((p.stock_qty * p.cost_price_cents)::numeric))::bigint AS potential_profit_cents,
    CASE
      WHEN round((p.stock_qty * p.selling_price_cents)::numeric) > 0 THEN
        round(
          (((round((p.stock_qty * p.selling_price_cents)::numeric) - round((p.stock_qty * p.cost_price_cents)::numeric))::numeric)
          / round((p.stock_qty * p.selling_price_cents)::numeric) * 100),
          2
        )
      ELSE 0.00
    END AS potential_margin_percent
  FROM products p
  JOIN categories c ON p.category_id = c.id
  WHERE p.is_active = true
  ORDER BY valuation_at_cost_cents DESC;
END;
$$;

-- ------------------------------------------------------------------------------
-- 10. FUNCTION report_low_stock()
-- Active products with quantities at or below declared reorder threshold.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_low_stock()
RETURNS TABLE (
  product_id uuid,
  product_name text,
  sku text,
  category_name text,
  stock_qty numeric(12,3),
  reorder_level numeric(12,3),
  cost_price_cents bigint,
  selling_price_cents bigint,
  shortfall_qty numeric(12,3)
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can access reports';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS product_id,
    p.name AS product_name,
    p.sku,
    c.name AS category_name,
    p.stock_qty,
    p.reorder_level,
    p.cost_price_cents,
    p.selling_price_cents,
    (p.reorder_level - p.stock_qty)::numeric(12,3) AS shortfall_qty
  FROM products p
  JOIN categories c ON p.category_id = c.id
  WHERE p.is_active = true
    AND p.stock_qty <= p.reorder_level
  ORDER BY shortfall_qty DESC;
END;
$$;

-- ------------------------------------------------------------------------------
-- 11. FUNCTION report_dead_stock(p_days int default 30)
-- Active items holding positive stock with zero sales in the last p_days days.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_dead_stock(
  p_days int DEFAULT 30
)
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
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz := now() - (p_days || ' days')::interval;
BEGIN
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can access reports';
  END IF;

  RETURN QUERY
  WITH recent_sales AS (
    SELECT
      si.product_id,
      max(s.created_at) AS max_sold_at
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

-- ------------------------------------------------------------------------------
-- 12. FUNCTION report_expiry(p_days int default 30)
-- Inventory batches approaching expiration within p_days days.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_expiry(
  p_days int DEFAULT 30
)
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
SET search_path = public
AS $$
DECLARE
  v_cutoff_date date := current_date + p_days;
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

-- ------------------------------------------------------------------------------
-- 13. FUNCTION report_tax(p_from date, p_to date)
-- Taxable vs tax-exempt sales and output VAT collected for filing.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_tax(
  p_from date,
  p_to date
)
RETURNS TABLE (
  report_date date,
  taxable_sales_cents bigint,
  tax_exempt_sales_cents bigint,
  tax_collected_cents bigint,
  effective_tax_rate numeric(8,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can access reports';
  END IF;

  SELECT v_start_ts, v_end_ts INTO v_start, v_end FROM get_colombo_bounds(p_from, p_to);

  RETURN QUERY
  WITH daily_tax AS (
    SELECT
      date(s.created_at AT TIME ZONE 'Asia/Colombo') AS d,
      coalesce(sum(s.taxable_cents), 0)::bigint AS taxable,
      coalesce(sum(CASE WHEN s.tax_cents = 0 THEN s.total_cents ELSE 0 END), 0)::bigint AS exempt,
      coalesce(sum(s.tax_cents), 0)::bigint AS tax_col
    FROM sales s
    WHERE s.created_at >= v_start
      AND s.created_at < v_end
      AND s.status != 'voided'
    GROUP BY date(s.created_at AT TIME ZONE 'Asia/Colombo')
  ),
  date_series AS (
    SELECT generate_series(p_from, p_to, '1 day'::interval)::date AS d
  )
  SELECT
    ds.d AS report_date,
    coalesce(dt.taxable, 0)::bigint AS taxable_sales_cents,
    coalesce(dt.exempt, 0)::bigint AS tax_exempt_sales_cents,
    coalesce(dt.tax_col, 0)::bigint AS tax_collected_cents,
    CASE
      WHEN coalesce(dt.taxable, 0) > 0 THEN
        round((coalesce(dt.tax_col, 0)::numeric / dt.taxable::numeric) * 100, 2)
      ELSE 0.00
    END AS effective_tax_rate
  FROM date_series ds
  LEFT JOIN daily_tax dt ON ds.d = dt.d
  ORDER BY ds.d ASC;
END;
$$;

-- ------------------------------------------------------------------------------
-- 14. FUNCTION report_returns_voids(p_from date, p_to date)
-- Detailed ledger of canceled transactions, returns and void reasons.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_returns_voids(
  p_from date,
  p_to date
)
RETURNS TABLE (
  id uuid,
  event_type text,
  event_no text,
  sale_id uuid,
  bill_no text,
  amount_cents bigint,
  reason text,
  created_at timestamptz,
  created_by_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can access reports';
  END IF;

  SELECT v_start_ts, v_end_ts INTO v_start, v_end FROM get_colombo_bounds(p_from, p_to);

  RETURN QUERY
  -- Voided Sales
  SELECT
    s.id,
    'void'::text AS event_type,
    ('VOID-' || s.bill_no)::text AS event_no,
    s.id AS sale_id,
    s.bill_no,
    s.total_cents AS amount_cents,
    coalesce(s.void_reason, 'No reason specified') AS reason,
    s.voided_at AS created_at,
    coalesce(prof.full_name, 'Manager / Owner') AS created_by_name
  FROM sales s
  LEFT JOIN profiles prof ON s.voided_by = prof.id
  WHERE s.status = 'voided'
    AND s.voided_at >= v_start
    AND s.voided_at < v_end

  UNION ALL

  -- Customer Returns
  SELECT
    sr.id,
    'return'::text AS event_type,
    sr.return_no AS event_no,
    sr.sale_id,
    s.bill_no,
    sr.refund_cents AS amount_cents,
    sr.reason,
    sr.created_at,
    coalesce(prof.full_name, 'Manager / Owner') AS created_by_name
  FROM sale_returns sr
  JOIN sales s ON sr.sale_id = s.id
  LEFT JOIN profiles prof ON sr.created_by = prof.id
  WHERE sr.created_at >= v_start
    AND sr.created_at < v_end

  ORDER BY created_at DESC;
END;
$$;

-- ------------------------------------------------------------------------------
-- 15. FUNCTION report_supplier_balances()
-- Outstanding accounts payable liabilities with suppliers.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_supplier_balances()
RETURNS TABLE (
  supplier_id uuid,
  supplier_name text,
  contact_person text,
  phone text,
  balance_cents bigint,
  last_purchase_date timestamptz,
  last_payment_date timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can access reports';
  END IF;

  RETURN QUERY
  WITH last_purchases AS (
    SELECT
      p.supplier_id,
      max(p.created_at) AS last_p_date
    FROM purchases p
    WHERE p.status = 'received'
    GROUP BY p.supplier_id
  ),
  last_payments AS (
    SELECT
      sp.supplier_id,
      max(sp.paid_at) AS last_pay_date
    FROM supplier_payments sp
    GROUP BY sp.supplier_id
  )
  SELECT
    s.id AS supplier_id,
    s.name AS supplier_name,
    s.contact_person,
    s.phone,
    s.balance_cents,
    lp.last_p_date AS last_purchase_date,
    lpay.last_pay_date AS last_payment_date
  FROM suppliers s
  LEFT JOIN last_purchases lp ON s.id = lp.supplier_id
  LEFT JOIN last_payments lpay ON s.id = lpay.supplier_id
  WHERE s.balance_cents > 0
  ORDER BY s.balance_cents DESC;
END;
$$;

-- ------------------------------------------------------------------------------
-- 16. FUNCTION report_top_customers(p_from date, p_to date, p_limit int)
-- High-value customers by gross counter spend and current loyalty points balance.
-- ------------------------------------------------------------------------------
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
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
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
  LIMIT p_limit;
END;
$$;

-- ------------------------------------------------------------------------------
-- 17. FUNCTION report_sms(p_from date, p_to date)
-- Customer SMS notification gateway throughput, successes and failure logs.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_sms(
  p_from date,
  p_to date
)
RETURNS TABLE (
  report_date date,
  total_sms int,
  sent_count int,
  failed_count int,
  pending_count int
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can access reports';
  END IF;

  SELECT v_start_ts, v_end_ts INTO v_start, v_end FROM get_colombo_bounds(p_from, p_to);

  RETURN QUERY
  WITH daily_sms AS (
    SELECT
      date(so.created_at AT TIME ZONE 'Asia/Colombo') AS d,
      count(so.id)::int AS total,
      coalesce(sum(CASE WHEN so.status = 'sent' THEN 1 ELSE 0 END), 0)::int AS sent_cnt,
      coalesce(sum(CASE WHEN so.status = 'failed' THEN 1 ELSE 0 END), 0)::int AS fail_cnt,
      coalesce(sum(CASE WHEN so.status IN ('pending', 'sending') THEN 1 ELSE 0 END), 0)::int AS pend_cnt
    FROM sms_outbox so
    WHERE so.created_at >= v_start
      AND so.created_at < v_end
    GROUP BY date(so.created_at AT TIME ZONE 'Asia/Colombo')
  ),
  date_series AS (
    SELECT generate_series(p_from, p_to, '1 day'::interval)::date AS d
  )
  SELECT
    ds.d AS report_date,
    coalesce(dsms.total, 0)::int AS total_sms,
    coalesce(dsms.sent_cnt, 0)::int AS sent_count,
    coalesce(dsms.fail_cnt, 0)::int AS failed_count,
    coalesce(dsms.pend_cnt, 0)::int AS pending_count
  FROM date_series ds
  LEFT JOIN daily_sms dsms ON ds.d = dsms.d
  ORDER BY ds.d ASC;
END;
$$;

-- ------------------------------------------------------------------------------
-- 18. FUNCTION report_reconciliation(p_from date, p_to date)
-- Four-way mathematical audit reconciliation:
-- (a) sum of sale totals = sum of payments minus change
-- (b) sum of sale_item line totals = sum of sale totals
-- (c) sum of stock movements per product = current stock_qty
-- (d) gapless bill sequence continuity check
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_reconciliation(
  p_from date,
  p_to date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;

  -- (a) Payments Balance Check
  v_sum_sales_a bigint := 0;
  v_sum_payments_minus_change bigint := 0;
  v_diff_a bigint := 0;
  v_pass_a boolean := true;

  -- (b) Items Balance Check
  v_sum_line_totals bigint := 0;
  v_sum_sales_b bigint := 0;
  v_diff_b bigint := 0;
  v_pass_b boolean := true;

  -- (c) Stock Movements Check
  v_stock_mismatches jsonb := '[]'::jsonb;
  v_mismatch_count int := 0;
  v_pass_c boolean := true;

  -- (d) Bill Sequence Check
  v_missing_bills jsonb := '[]'::jsonb;
  v_missing_count int := 0;
  v_pass_d boolean := true;

  v_rec record;
  v_all_passed boolean := true;
BEGIN
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can access reports';
  END IF;

  SELECT v_start_ts, v_end_ts INTO v_start, v_end FROM get_colombo_bounds(p_from, p_to);

  -- (a) Check: sum of sale totals = sum(payments) - sum(change) on non-voided sales
  SELECT
    coalesce(sum(s.total_cents), 0),
    coalesce(sum(s.paid_cents - s.change_cents), 0)
  INTO v_sum_sales_a, v_sum_payments_minus_change
  FROM sales s
  WHERE s.created_at >= v_start
    AND s.created_at < v_end
    AND s.status != 'voided';

  v_diff_a := v_sum_sales_a - v_sum_payments_minus_change;
  IF v_diff_a != 0 THEN
    v_pass_a := false;
  END IF;

  -- (b) Check: sum of sale_item line totals = sum of sale totals
  SELECT
    coalesce(sum(si.line_total_cents), 0)
  INTO v_sum_line_totals
  FROM sale_items si
  JOIN sales s ON si.sale_id = s.id
  WHERE s.created_at >= v_start
    AND s.created_at < v_end
    AND s.status != 'voided';

  v_sum_sales_b := v_sum_sales_a;
  v_diff_b := v_sum_line_totals - v_sum_sales_b;
  IF v_diff_b != 0 THEN
    v_pass_b := false;
  END IF;

  -- (c) Check: sum of stock movements per product = current stock_qty
  WITH moves_calc AS (
    SELECT
      sm.product_id,
      coalesce(sum(sm.qty_change), 0) AS total_movement
    FROM stock_movements sm
    GROUP BY sm.product_id
  ),
  discrepancies AS (
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.sku,
      p.stock_qty AS current_stock,
      coalesce(mc.total_movement, 0) AS calculated_stock,
      (p.stock_qty - coalesce(mc.total_movement, 0)) AS diff_qty
    FROM products p
    LEFT JOIN moves_calc mc ON p.id = mc.product_id
    WHERE p.stock_qty IS DISTINCT FROM coalesce(mc.total_movement, 0)
  )
  SELECT
    count(*)::int,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'product_id', d.product_id,
        'product_name', d.product_name,
        'sku', d.sku,
        'current_stock', d.current_stock,
        'calculated_stock', d.calculated_stock,
        'diff_qty', d.diff_qty
      )
    ), '[]'::jsonb)
  INTO v_mismatch_count, v_stock_mismatches
  FROM discrepancies d;

  IF v_mismatch_count > 0 THEN
    v_pass_c := false;
  END IF;

  -- (d) Check: every bill number in the range is present with no gaps.
  -- Bill numbers format: WWL-YYYYMMDD-NNNN
  WITH bill_seqs AS (
    SELECT
      split_part(s.bill_no, '-', 2) AS b_date,
      split_part(s.bill_no, '-', 3)::int AS seq_no
    FROM sales s
    WHERE s.created_at >= v_start
      AND s.created_at < v_end
  ),
  daily_bounds AS (
    SELECT
      b_date,
      min(seq_no) AS min_seq,
      max(seq_no) AS max_seq,
      count(*) AS actual_count
    FROM bill_seqs
    GROUP BY b_date
  ),
  day_gaps AS (
    SELECT
      db.b_date,
      db.min_seq,
      db.max_seq,
      (db.max_seq - db.min_seq + 1) AS expected_count,
      db.actual_count
    FROM daily_bounds db
    WHERE (db.max_seq - db.min_seq + 1) != db.actual_count
       OR db.min_seq != 1
  )
  SELECT
    count(*)::int,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'date', dg.b_date,
        'min_seq', dg.min_seq,
        'max_seq', dg.max_seq,
        'missing_count', (dg.expected_count - dg.actual_count)
      )
    ), '[]'::jsonb)
  INTO v_missing_count, v_missing_bills
  FROM day_gaps dg;

  IF v_missing_count > 0 THEN
    v_pass_d := false;
  END IF;

  v_all_passed := v_pass_a AND v_pass_b AND v_pass_c AND v_pass_d;

  RETURN jsonb_build_object(
    'all_passed', v_all_passed,
    'payments_balance_check', jsonb_build_object(
      'passed', v_pass_a,
      'sum_sales_cents', v_sum_sales_a,
      'sum_payments_minus_change_cents', v_sum_payments_minus_change,
      'diff_cents', v_diff_a
    ),
    'items_balance_check', jsonb_build_object(
      'passed', v_pass_b,
      'sum_line_totals_cents', v_sum_line_totals,
      'sum_sales_cents', v_sum_sales_b,
      'diff_cents', v_diff_b
    ),
    'stock_movements_check', jsonb_build_object(
      'passed', v_pass_c,
      'mismatched_products_count', v_mismatch_count,
      'details', v_stock_mismatches
    ),
    'bill_sequence_check', jsonb_build_object(
      'passed', v_pass_d,
      'missing_bills_count', v_missing_count,
      'gaps', v_missing_bills
    )
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 19. FUNCTION report_dashboard_summary()
-- Aggregated live dashboard feed for managers and owners.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_dashboard_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_colombo_today date := (v_now AT TIME ZONE 'Asia/Colombo')::date;
  v_today_start timestamptz := (v_colombo_today::text || ' 00:00:00+05:30')::timestamptz;
  v_today_end timestamptz := ((v_colombo_today + 1)::text || ' 00:00:00+05:30')::timestamptz;
  v_seven_days_ago timestamptz := ((v_colombo_today - 6)::text || ' 00:00:00+05:30')::timestamptz;

  v_today_sales_cents bigint := 0;
  v_today_bill_count int := 0;
  v_today_avg_bill_cents bigint := 0;
  v_today_cogs_cents bigint := 0;
  v_today_gross_profit_cents bigint := 0;
  v_today_margin_percent numeric(8,2) := 0.00;

  v_low_stock_count int := 0;
  v_open_shifts_count int := 0;
  v_failed_sms_count int := 0;

  v_top_5_products jsonb := '[]'::jsonb;
  v_last_7_days jsonb := '[]'::jsonb;
BEGIN
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can access the dashboard';
  END IF;

  -- 1. Today's Core KPIs
  SELECT
    coalesce(sum(s.total_cents), 0),
    count(s.id)::int
  INTO v_today_sales_cents, v_today_bill_count
  FROM sales s
  WHERE s.created_at >= v_today_start
    AND s.created_at < v_today_end
    AND s.status != 'voided';

  IF v_today_bill_count > 0 THEN
    v_today_avg_bill_cents := round(v_today_sales_cents::numeric / v_today_bill_count::numeric)::bigint;
  END IF;

  -- Today's COGS & Profit
  SELECT
    coalesce(sum(round((si.quantity * si.unit_cost_cents_snapshot)::numeric)), 0)
  INTO v_today_cogs_cents
  FROM sale_items si
  JOIN sales s ON si.sale_id = s.id
  WHERE s.created_at >= v_today_start
    AND s.created_at < v_today_end
    AND s.status != 'voided';

  v_today_gross_profit_cents := v_today_sales_cents - v_today_cogs_cents;
  IF v_today_sales_cents > 0 THEN
    v_today_margin_percent := round((v_today_gross_profit_cents::numeric / v_today_sales_cents::numeric) * 100, 2);
  END IF;

  -- 2. Top 5 Products Today
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'product_id', t.product_id,
      'product_name', t.product_name,
      'sku', t.sku,
      'quantity_sold', t.qty,
      'revenue_cents', t.rev
    )
  ), '[]'::jsonb)
  INTO v_top_5_products
  FROM (
    SELECT
      si.product_id,
      p.name AS product_name,
      p.sku,
      sum(si.quantity)::numeric(12,3) AS qty,
      sum(si.line_total_cents)::bigint AS rev
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    JOIN products p ON si.product_id = p.id
    WHERE s.created_at >= v_today_start
      AND s.created_at < v_today_end
      AND s.status != 'voided'
    GROUP BY si.product_id, p.name, p.sku
    ORDER BY rev DESC
    LIMIT 5
  ) t;

  -- 3. Last 7 Days Sales Trend
  WITH d_range AS (
    SELECT generate_series((v_colombo_today - 6), v_colombo_today, '1 day'::interval)::date AS day_date
  ),
  d_sales AS (
    SELECT
      date(s.created_at AT TIME ZONE 'Asia/Colombo') AS s_date,
      coalesce(sum(s.total_cents), 0)::bigint AS rev,
      count(s.id)::int AS cnt
    FROM sales s
    WHERE s.created_at >= v_seven_days_ago
      AND s.created_at < v_today_end
      AND s.status != 'voided'
    GROUP BY date(s.created_at AT TIME ZONE 'Asia/Colombo')
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'date', dr.day_date,
      'revenue_cents', coalesce(ds.rev, 0),
      'bill_count', coalesce(ds.cnt, 0)
    ) ORDER BY dr.day_date ASC
  ), '[]'::jsonb)
  INTO v_last_7_days
  FROM d_range dr
  LEFT JOIN d_sales ds ON dr.day_date = ds.s_date;

  -- 4. Counts: Low Stock, Open Shifts, Failed SMS
  SELECT count(*)::int INTO v_low_stock_count
  FROM products
  WHERE is_active = true AND stock_qty <= reorder_level;

  SELECT count(*)::int INTO v_open_shifts_count
  FROM shifts
  WHERE status = 'open';

  SELECT count(*)::int INTO v_failed_sms_count
  FROM sms_outbox
  WHERE status = 'failed';

  RETURN jsonb_build_object(
    'today_sales_cents', v_today_sales_cents,
    'today_bill_count', v_today_bill_count,
    'today_avg_bill_cents', v_today_avg_bill_cents,
    'today_gross_profit_cents', v_today_gross_profit_cents,
    'today_margin_percent', v_today_margin_percent,
    'top_5_products_today', v_top_5_products,
    'last_7_days_sales', v_last_7_days,
    'low_stock_count', v_low_stock_count,
    'open_shifts_count', v_open_shifts_count,
    'failed_sms_count', v_failed_sms_count
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 20. REVOKE PUBLIC ACCESS & GRANT ONLY TO AUTHENTICATED
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION get_colombo_bounds FROM public;
GRANT EXECUTE ON FUNCTION get_colombo_bounds TO authenticated;

REVOKE ALL ON FUNCTION report_daily_summary FROM public;
GRANT EXECUTE ON FUNCTION report_daily_summary TO authenticated;

REVOKE ALL ON FUNCTION report_sales_by_product FROM public;
GRANT EXECUTE ON FUNCTION report_sales_by_product TO authenticated;

REVOKE ALL ON FUNCTION report_sales_by_category FROM public;
GRANT EXECUTE ON FUNCTION report_sales_by_category TO authenticated;

REVOKE ALL ON FUNCTION report_sales_by_cashier FROM public;
GRANT EXECUTE ON FUNCTION report_sales_by_cashier TO authenticated;

REVOKE ALL ON FUNCTION report_sales_by_hour FROM public;
GRANT EXECUTE ON FUNCTION report_sales_by_hour TO authenticated;

REVOKE ALL ON FUNCTION report_profit FROM public;
GRANT EXECUTE ON FUNCTION report_profit TO authenticated;

REVOKE ALL ON FUNCTION report_stock_valuation FROM public;
GRANT EXECUTE ON FUNCTION report_stock_valuation TO authenticated;

REVOKE ALL ON FUNCTION report_low_stock FROM public;
GRANT EXECUTE ON FUNCTION report_low_stock TO authenticated;

REVOKE ALL ON FUNCTION report_dead_stock FROM public;
GRANT EXECUTE ON FUNCTION report_dead_stock TO authenticated;

REVOKE ALL ON FUNCTION report_expiry FROM public;
GRANT EXECUTE ON FUNCTION report_expiry TO authenticated;

REVOKE ALL ON FUNCTION report_tax FROM public;
GRANT EXECUTE ON FUNCTION report_tax TO authenticated;

REVOKE ALL ON FUNCTION report_returns_voids FROM public;
GRANT EXECUTE ON FUNCTION report_returns_voids TO authenticated;

REVOKE ALL ON FUNCTION report_supplier_balances FROM public;
GRANT EXECUTE ON FUNCTION report_supplier_balances TO authenticated;

REVOKE ALL ON FUNCTION report_top_customers FROM public;
GRANT EXECUTE ON FUNCTION report_top_customers TO authenticated;

REVOKE ALL ON FUNCTION report_sms FROM public;
GRANT EXECUTE ON FUNCTION report_sms TO authenticated;

REVOKE ALL ON FUNCTION report_reconciliation FROM public;
GRANT EXECUTE ON FUNCTION report_reconciliation TO authenticated;

REVOKE ALL ON FUNCTION report_dashboard_summary FROM public;
GRANT EXECUTE ON FUNCTION report_dashboard_summary TO authenticated;

