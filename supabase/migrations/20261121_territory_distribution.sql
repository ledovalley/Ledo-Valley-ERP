-- =============================================================================
-- Territory Distribution (main Dashboard), added up inside the database
--
-- The Dashboard's Territory Distribution panel used to load every shift and every
-- retailer ever recorded and add them up in the app, which gets slower every day.
-- This function returns one small row per territory instead:
--   revenue / orders   = totals from shifts in that territory
--   cnt                = number of shifts + number of (not removed) retailers there
-- The app works out the percentages and the order, exactly as before.
--
-- Pass a user id to count only that sales person's shifts and retailers
-- (what a sales person sees); NULL = everyone (admin / manager).
--
-- Read-only: nothing is changed, added or deleted. Only the server (service role)
-- can call it. Safe to run more than once. Until it is run, the app keeps using the
-- slower way, so nothing breaks.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_territory_distribution(p_user UUID DEFAULT NULL)
RETURNS TABLE (territory TEXT, revenue NUMERIC, orders NUMERIC, cnt BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH s AS (
    SELECT btrim(sh.territory, E' \t\r\n') AS t,
           COALESCE(sum(COALESCE(sh.total_order_value, 0)), 0) AS revenue,
           COALESCE(sum(COALESCE(sh.orders_count, 0)), 0)      AS orders,
           count(*)                                            AS cnt
      FROM shifts sh
     WHERE (p_user IS NULL OR sh.user_id = p_user)
       AND btrim(COALESCE(sh.territory, ''), E' \t\r\n') <> ''
     GROUP BY 1
  ),
  r AS (
    SELECT btrim(rt.territory, E' \t\r\n') AS t, count(*) AS cnt
      FROM retailers rt
     WHERE (p_user IS NULL OR rt.sales_person_id = p_user)
       -- removed retailers are left out (tolerates a database without the is_active column)
       AND COALESCE((to_jsonb(rt)->>'is_active')::boolean, TRUE)
       AND btrim(COALESCE(rt.territory, ''), E' \t\r\n') <> ''
     GROUP BY 1
  )
  SELECT COALESCE(s.t, r.t)                     AS territory,
         COALESCE(s.revenue, 0)::NUMERIC        AS revenue,
         COALESCE(s.orders, 0)::NUMERIC         AS orders,
         (COALESCE(s.cnt, 0) + COALESCE(r.cnt, 0))::BIGINT AS cnt
    FROM s FULL OUTER JOIN r ON r.t = s.t
   ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.fn_territory_distribution(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_territory_distribution(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
