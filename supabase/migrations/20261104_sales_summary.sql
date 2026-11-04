-- =============================================================================
-- Sales totals added up inside the database (fast for any period, always exact)
--
-- Used by:
--   - the Sales page period view (quarter / 6 months / year / custom): one row per
--     salesperson with orders, revenue, cash, online, due, retailers reached,
--     new retailers and visits
--   - the dashboard's total revenue and order count (previously only the first
--     1,000 sales were added up)
--
-- Read-only: it changes no data. Callable only with the service-role key (the
-- server checks the user's role first). Safe to run more than once.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_sales_summary(
  p_from           TIMESTAMPTZ DEFAULT NULL,  -- NULL = from the beginning
  p_to             TIMESTAMPTZ DEFAULT NULL,  -- NULL = up to now (exclusive end otherwise)
  p_sales_person   UUID        DEFAULT NULL   -- NULL = everyone
)
RETURNS TABLE (
  sales_person_id    UUID,
  orders             BIGINT,
  revenue            NUMERIC,
  cash               NUMERIC,
  online             NUMERIC,
  due                NUMERIC,
  retailers_reached  BIGINT,
  new_retailers      BIGINT,
  visits             BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH s AS (
    SELECT sr.sales_person_id,
           count(*)                              AS orders,
           COALESCE(sum(sr.amount), 0)           AS revenue,
           COALESCE(sum(sr.cash_amount), 0)      AS cash,
           COALESCE(sum(sr.online_amount), 0)    AS online,
           COALESCE(sum(sr.due_amount), 0)       AS due,
           count(DISTINCT sr.retailer_id)        AS retailers_reached
      FROM sales_records sr
     WHERE (p_from IS NULL OR sr.created_at >= p_from)
       AND (p_to   IS NULL OR sr.created_at <  p_to)
       AND (p_sales_person IS NULL OR sr.sales_person_id = p_sales_person)
     GROUP BY sr.sales_person_id
  ),
  r AS (
    SELECT rt.sales_person_id, count(*) AS new_retailers
      FROM retailers rt
     WHERE (p_from IS NULL OR rt.created_at >= p_from)
       AND (p_to   IS NULL OR rt.created_at <  p_to)
       AND (p_sales_person IS NULL OR rt.sales_person_id = p_sales_person)
     GROUP BY rt.sales_person_id
  ),
  v AS (
    SELECT rv.sales_person_id, count(*) AS visits
      FROM retailer_visits rv
     WHERE (p_from IS NULL OR rv.created_at >= p_from)
       AND (p_to   IS NULL OR rv.created_at <  p_to)
       AND (p_sales_person IS NULL OR rv.sales_person_id = p_sales_person)
     GROUP BY rv.sales_person_id
  ),
  people AS (
    SELECT s.sales_person_id FROM s UNION SELECT r.sales_person_id FROM r UNION SELECT v.sales_person_id FROM v
  )
  SELECT p.sales_person_id,
         COALESCE(s.orders, 0), COALESCE(s.revenue, 0), COALESCE(s.cash, 0), COALESCE(s.online, 0),
         COALESCE(s.due, 0), COALESCE(s.retailers_reached, 0), COALESCE(r.new_retailers, 0), COALESCE(v.visits, 0)
    FROM people p
    LEFT JOIN s ON s.sales_person_id IS NOT DISTINCT FROM p.sales_person_id
    LEFT JOIN r ON r.sales_person_id IS NOT DISTINCT FROM p.sales_person_id
    LEFT JOIN v ON v.sales_person_id IS NOT DISTINCT FROM p.sales_person_id;
$$;

REVOKE ALL ON FUNCTION public.fn_sales_summary(TIMESTAMPTZ, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sales_summary(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO service_role;

-- Speeds up loading a period of sales (newest first) and per-person periods.
CREATE INDEX IF NOT EXISTS idx_sales_records_created_at ON public.sales_records (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_records_person_created ON public.sales_records (sales_person_id, created_at DESC);

