-- =============================================================================
-- Allowance corrections: make the save and the "version check" immune to column
-- type differences (fixes "operator does not exist" when saving a correction)
--
-- Same behaviour as 20261118_allowance_corrections.sql. The only change: every
-- comparison inside the two functions now states its types explicitly, so it
-- works even if a column in the live database has a different type than expected.
-- Old copies of the two functions (any parameter list) are replaced.
-- No data is read, changed or deleted. Safe to run more than once.
-- =============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname IN ('fn_save_allowance_correction', 'fn_allowance_corr_token')
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.fn_allowance_corr_token(p_week DATE, p_user UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*)::text || '|' || count(cancelled_at)::text
  FROM public.allowance_corrections
  WHERE week_start::date = p_week AND user_id::text = p_user::text;
$$;

-- -----------------------------------------------------------------------------
-- Save one person's corrections for one week (replaces their live ones).
--   p_days  : [{date, present, km, orig_present, orig_shifts, orig_km}, ...]
--             only the days that differ from the shifts
--   p_extra : one-off extra amount (0 = none)
--   Empty p_days and p_extra = 0 means "reset to calculated".
-- Returns JSON {ok:true, token} or raises a message the app understands.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_save_allowance_correction(
  p_week           DATE,
  p_user_id        UUID,
  p_user_name      TEXT,
  p_days           JSONB,
  p_extra          NUMERIC,
  p_reason         TEXT,
  p_expected_token TEXT,
  p_by_id          UUID,
  p_by_name        TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_save UUID := gen_random_uuid();
  v_item JSONB;
  v_reason TEXT := btrim(coalesce(p_reason, ''));
  v_extra NUMERIC := round(coalesce(p_extra, 0), 2);
  v_has_new BOOLEAN;
BEGIN
  IF p_week IS NULL OR EXTRACT(ISODOW FROM p_week) <> 1 THEN
    RAISE EXCEPTION 'ALLOWANCE_BAD_WEEK';
  END IF;
  IF p_days IS NULL OR jsonb_typeof(p_days) <> 'array' THEN
    RAISE EXCEPTION 'ALLOWANCE_BAD_DAYS';
  END IF;

  -- one save at a time per person and week
  PERFORM pg_advisory_xact_lock(hashtext('allowance_corr|' || p_week::text || '|' || p_user_id::text));

  IF EXISTS (SELECT 1 FROM public.allowance_payouts
             WHERE week_start::date = p_week AND user_id::text = p_user_id::text AND cancelled_at IS NULL) THEN
    RAISE EXCEPTION 'ALLOWANCE_WEEK_PAID';
  END IF;

  IF coalesce(p_expected_token, '') <> public.fn_allowance_corr_token(p_week, p_user_id) THEN
    RAISE EXCEPTION 'ALLOWANCE_STALE';
  END IF;

  v_has_new := jsonb_array_length(p_days) > 0 OR v_extra <> 0;
  IF v_has_new AND char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'ALLOWANCE_NEEDS_REASON';
  END IF;

  -- retire the earlier corrections (kept, never deleted)
  UPDATE public.allowance_corrections
     SET cancelled_at = NOW(), cancelled_by = p_by_id, cancelled_by_name = p_by_name,
         cancelled_reason = CASE WHEN v_has_new THEN 'Replaced by a newer correction'
                                 ELSE coalesce(nullif(v_reason, ''), 'Reset to the calculated figures') END
   WHERE week_start::date = p_week AND user_id::text = p_user_id::text AND cancelled_at IS NULL;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_days) LOOP
    INSERT INTO public.allowance_corrections
      (save_id, week_start, user_id, user_name, day_date, present, km, orig_present, orig_shifts, orig_km,
       reason, created_by, created_by_name)
    VALUES
      (v_save, p_week, p_user_id, p_user_name, (v_item->>'date')::date,
       (v_item->>'present')::boolean,
       CASE WHEN (v_item->>'present')::boolean THEN round((v_item->>'km')::numeric, 2) ELSE 0 END,
       (v_item->>'orig_present')::boolean, nullif(v_item->>'orig_shifts','')::int, nullif(v_item->>'orig_km','')::numeric,
       v_reason, p_by_id, p_by_name);
  END LOOP;

  IF v_extra <> 0 THEN
    INSERT INTO public.allowance_corrections
      (save_id, week_start, user_id, user_name, day_date, extra_amount, reason, created_by, created_by_name)
    VALUES (v_save, p_week, p_user_id, p_user_name, NULL, v_extra, v_reason, p_by_id, p_by_name);
  END IF;

  RETURN jsonb_build_object('ok', true, 'token', public.fn_allowance_corr_token(p_week, p_user_id));
END;
$$;


REVOKE EXECUTE ON FUNCTION public.fn_allowance_corr_token(DATE, UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_allowance_corr_token(DATE, UUID) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_save_allowance_correction(DATE, UUID, TEXT, JSONB, NUMERIC, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_save_allowance_correction(DATE, UUID, TEXT, JSONB, NUMERIC, TEXT, TEXT, UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
