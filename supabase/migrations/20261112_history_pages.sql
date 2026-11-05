-- =============================================================================
-- History tab: pages, search and filters over the WHOLE factory history
--
-- Before: the History tab only had the newest entries (300 when the page
-- opened, 50 after any change); its page buttons, search, filters, totals and
-- exports only looked through those.
-- Now each page is loaded from the database, so every entry ever recorded can
-- be paged to, searched and exported.
--
-- fn_factory_history_page: one page (newest first) + how many entries match
--   + the Total Validated Yields / Variance figures for everything that matches.
-- fn_factory_history_filters: every user and action type in history.
--
-- Read-only: changes no data. Service role only (the server checks the user's
-- role first). Safe to run more than once. Until it is run, the History tab
-- works the old way (newest 300 / 50).
-- =============================================================================

-- Text -> number, NULL if it isn't one (old entries may hold anything)
CREATE OR REPLACE FUNCTION public.fn__num(p TEXT)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p ~ '^\s*-?\d+(\.\d+)?\s*$' THEN p::numeric END
$$;

CREATE OR REPLACE FUNCTION public.fn_factory_history_page(
  p_query  TEXT    DEFAULT NULL,   -- search text (blend, SL no., batch, lot, mark, product, description...)
  p_type   TEXT    DEFAULT NULL,   -- one action type
  p_user   TEXT    DEFAULT NULL,   -- one user name
  p_offset INTEGER DEFAULT 0,
  p_limit  INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH q AS (
    SELECT CASE WHEN btrim(COALESCE(p_query, '')) = '' THEN NULL
                ELSE '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
           END AS pattern
  ),
  f AS (
    SELECT h.*
      FROM factory_history h, q
     WHERE (p_type IS NULL OR h.type = p_type)
       AND (p_user IS NULL OR h.user_name = p_user OR h.user_id::text = p_user)
       AND (q.pattern IS NULL
            OR h.description ILIKE q.pattern
            OR h.details::text ILIKE q.pattern
            OR h.type ILIKE q.pattern
            OR h.id ILIKE q.pattern)
  ),
  pg AS (
    SELECT * FROM f
     ORDER BY timestamp DESC, id DESC
     OFFSET GREATEST(COALESCE(p_offset, 0), 0)
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 500)
  ),
  -- Same figures the History tab shows at the top, for finalized blends
  k AS (
    SELECT COALESCE(sum(fn__num(details->>'totalOutputQuantity')), 0) AS total_yields,
           COALESCE(sum(CASE WHEN details->>'completedDate' >= '2026-07-10'
                             THEN COALESCE(fn__num(details->>'totalQuantity'), 0)
                                - COALESCE(fn__num(details->>'totalOutputQuantity'), 0)
                                - COALESCE(fn__num(details->>'returnedLooseWeight'), 0) END), 0) AS total_variance,
           min(NULLIF(details->>'completedDate', '')) AS min_date,
           max(NULLIF(details->>'completedDate', '')) AS max_date
      FROM f
     WHERE type IN ('Finalized Process', 'BLEND_PACKED')
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM f),
    'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'id', id, 'type', type, 'description', description, 'timestamp', timestamp,
                'user_id', user_id, 'user_name', user_name, 'details', details)
              ORDER BY timestamp DESC, id DESC) FROM pg), '[]'::jsonb),
    'kpi', (SELECT jsonb_build_object('totalYields', total_yields, 'totalVariance', total_variance,
                                      'minDate', min_date, 'maxDate', max_date) FROM k));
$$;

CREATE OR REPLACE FUNCTION public.fn_factory_history_filters()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'types', COALESCE((SELECT jsonb_agg(t ORDER BY t) FROM (SELECT DISTINCT type AS t FROM factory_history WHERE type IS NOT NULL) a), '[]'::jsonb),
    'users', COALESCE((SELECT jsonb_agg(u ORDER BY u) FROM (SELECT DISTINCT user_name AS u FROM factory_history WHERE user_name IS NOT NULL AND user_name <> '') b), '[]'::jsonb));
$$;

REVOKE ALL ON FUNCTION public.fn_factory_history_page(TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_factory_history_filters() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_factory_history_page(TEXT, TEXT, TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_factory_history_filters() TO service_role;

-- Newest-first pages stay fast as history grows
CREATE INDEX IF NOT EXISTS idx_factory_history_timestamp_id ON public.factory_history (timestamp DESC, id DESC);
