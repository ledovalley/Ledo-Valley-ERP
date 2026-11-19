-- =============================================================================
-- Retailer insights (admin Sales page -> Insights tab)
--
-- Adds up every active retailer's orders and visits inside the database, so the
-- page never has to load all orders. Two read-only functions and two indexes.
-- No existing data is changed. Safe to run more than once.
--
--   fn_retailer_insights(from, to, previous_from, include_removed)
--       one row per retailer: lifetime orders / revenue / outstanding due, first
--       and last order, and for the chosen period and the equal-length period
--       before it: orders, revenue, cash / online / due, visits and how many of
--       them ended in an order.
--   fn_no_order_reasons(from, to, include_removed)
--       why visits ended without an order, counted.
--
-- Orders marked "cancelled" are left out (cancelled orders from the Cancel sale
-- feature are already moved out of sales_records).
-- Only the server (service role) can call them; the app checks the user is an
-- admin first.
-- =============================================================================

-- The app already saves these two on every visit; this only makes sure they exist
-- (it does nothing when they do).
ALTER TABLE public.retailer_visits ADD COLUMN IF NOT EXISTS visit_type      TEXT;
ALTER TABLE public.retailer_visits ADD COLUMN IF NOT EXISTS no_order_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_records_retailer_created
  ON public.sales_records (retailer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retailer_visits_retailer_created
  ON public.retailer_visits (retailer_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.fn_retailer_insights(
  p_from            TIMESTAMPTZ,
  p_to              TIMESTAMPTZ,
  p_prev_from       TIMESTAMPTZ,
  p_include_removed BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  retailer_id          UUID,
  name                 TEXT,
  shop_name            TEXT,
  territory            TEXT,
  sales_person_id      UUID,
  created_at           TIMESTAMPTZ,
  is_active            BOOLEAN,
  orders_total         BIGINT,
  revenue_total        NUMERIC,
  due_outstanding      NUMERIC,
  first_order_at       TIMESTAMPTZ,
  last_order_at        TIMESTAMPTZ,
  orders_period        BIGINT,
  revenue_period       NUMERIC,
  cash_period          NUMERIC,
  online_period        NUMERIC,
  due_period           NUMERIC,
  orders_prev          BIGINT,
  revenue_prev         NUMERIC,
  visits_period        BIGINT,
  order_visits_period  BIGINT,
  last_visit_at        TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH s AS (
    SELECT sr.retailer_id                                              AS rid,
           count(*)                                                    AS orders_total,
           COALESCE(sum(sr.amount), 0)                                 AS revenue_total,
           COALESCE(sum(GREATEST(sr.due_amount, 0)), 0)                AS due_outstanding,
           min(sr.created_at)                                          AS first_order_at,
           max(sr.created_at)                                          AS last_order_at,
           count(*) FILTER (WHERE sr.created_at >= p_from AND sr.created_at < p_to)                         AS orders_period,
           COALESCE(sum(sr.amount)          FILTER (WHERE sr.created_at >= p_from AND sr.created_at < p_to), 0) AS revenue_period,
           COALESCE(sum(sr.cash_amount)     FILTER (WHERE sr.created_at >= p_from AND sr.created_at < p_to), 0) AS cash_period,
           COALESCE(sum(sr.online_amount)   FILTER (WHERE sr.created_at >= p_from AND sr.created_at < p_to), 0) AS online_period,
           COALESCE(sum(sr.due_amount)      FILTER (WHERE sr.created_at >= p_from AND sr.created_at < p_to), 0) AS due_period,
           count(*) FILTER (WHERE sr.created_at >= p_prev_from AND sr.created_at < p_from)                  AS orders_prev,
           COALESCE(sum(sr.amount)          FILTER (WHERE sr.created_at >= p_prev_from AND sr.created_at < p_from), 0) AS revenue_prev
      FROM public.sales_records sr
     WHERE sr.retailer_id IS NOT NULL
       AND COALESCE(sr.delivery_status, 'delivered') <> 'cancelled'
     GROUP BY sr.retailer_id
  ),
  v AS (
    SELECT rv.retailer_id AS rid,
           count(*) FILTER (WHERE rv.created_at >= p_from AND rv.created_at < p_to)                              AS visits_period,
           count(*) FILTER (WHERE rv.created_at >= p_from AND rv.created_at < p_to AND rv.visit_type = 'order') AS order_visits_period,
           max(rv.created_at)                                                                                    AS last_visit_at
      FROM public.retailer_visits rv
     WHERE rv.retailer_id IS NOT NULL
     GROUP BY rv.retailer_id
  )
  SELECT r.id, r.name, r.shop_name, r.territory, r.sales_person_id, r.created_at, COALESCE(r.is_active, TRUE),
         COALESCE(s.orders_total, 0), COALESCE(s.revenue_total, 0), COALESCE(s.due_outstanding, 0),
         s.first_order_at, s.last_order_at,
         COALESCE(s.orders_period, 0), COALESCE(s.revenue_period, 0), COALESCE(s.cash_period, 0),
         COALESCE(s.online_period, 0), COALESCE(s.due_period, 0),
         COALESCE(s.orders_prev, 0), COALESCE(s.revenue_prev, 0),
         COALESCE(v.visits_period, 0), COALESCE(v.order_visits_period, 0), v.last_visit_at
    FROM public.retailers r
    LEFT JOIN s ON s.rid = r.id
    LEFT JOIN v ON v.rid = r.id
   WHERE p_include_removed OR COALESCE(r.is_active, TRUE)
   ORDER BY r.id;   -- stable order, so the app can read it page by page
$$;

CREATE OR REPLACE FUNCTION public.fn_no_order_reasons(
  p_from            TIMESTAMPTZ,
  p_to              TIMESTAMPTZ,
  p_include_removed BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (reason TEXT, visits BIGINT, retailers BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(NULLIF(btrim(rv.no_order_reason), ''), 'Other') AS reason,
         count(*)                                                 AS visits,
         count(DISTINCT rv.retailer_id)                           AS retailers
    FROM public.retailer_visits rv
    LEFT JOIN public.retailers r ON r.id = rv.retailer_id
   WHERE rv.visit_type = 'no_order'
     AND rv.created_at >= p_from AND rv.created_at < p_to
     AND (p_include_removed OR COALESCE(r.is_active, TRUE))
   GROUP BY 1
   ORDER BY 2 DESC, 1;
$$;

REVOKE ALL ON FUNCTION public.fn_retailer_insights(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_retailer_insights(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) TO service_role;
REVOKE ALL ON FUNCTION public.fn_no_order_reasons(TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_no_order_reasons(TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) TO service_role;

NOTIFY pgrst, 'reload schema';
