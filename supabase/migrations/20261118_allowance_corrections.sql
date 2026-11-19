-- =============================================================================
-- Admin corrections to the weekly allowance
--
-- Allowances are worked out from the shifts (days present x food rate, km x km
-- rate). When a shift was entered wrongly (wrong km, a missed day), an admin can
-- correct one person's week, day by day: mark a day present / absent, change the
-- km, and optionally add a one-off extra amount (+ or -).
--
-- * The shifts themselves and the sales cash are NEVER touched. A correction
--   sits on top of them.
-- * Nothing is ever deleted. Saving again retires the earlier correction (kept,
--   with who and when) and stores the new one. "Reset" retires them all.
-- * A week already marked as paid cannot be corrected (Undo paid first), so paid
--   amounts never change.
-- * Two admins saving at the same moment cannot overwrite each other: the save
--   is refused if the person's week changed since it was opened.
--
-- Only the server (service role) can read or write. No existing data is changed.
-- Safe to run more than once.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.allowance_corrections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id           UUID NOT NULL,                  -- all rows of one save share this
  week_start        DATE NOT NULL,                  -- the Monday (India time)
  user_id           UUID NOT NULL,
  user_name         TEXT,
  day_date          DATE,                           -- NULL = the one-off extra amount row
  present           BOOLEAN,                        -- corrected: counted present that day?
  km                NUMERIC CHECK (km IS NULL OR km >= 0),   -- corrected km for that day
  orig_present      BOOLEAN,                        -- what the shifts said
  orig_shifts       INTEGER,
  orig_km           NUMERIC,
  extra_amount      NUMERIC,                        -- only on the day_date IS NULL row
  reason            TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID,
  created_by_name   TEXT,
  cancelled_at      TIMESTAMPTZ,
  cancelled_by      UUID,
  cancelled_by_name TEXT,
  cancelled_reason  TEXT,
  CHECK (EXTRACT(ISODOW FROM week_start) = 1),
  CHECK (
    (day_date IS NOT NULL AND present IS NOT NULL AND km IS NOT NULL AND extra_amount IS NULL
       AND day_date >= week_start AND day_date <= week_start + 6)
    OR
    (day_date IS NULL AND extra_amount IS NOT NULL AND present IS NULL AND km IS NULL)
  )
);

-- One live correction per person, per day (and one live extra per person, per week)
CREATE UNIQUE INDEX IF NOT EXISTS uq_allowance_corr_day
  ON public.allowance_corrections (week_start, user_id, day_date)
  WHERE cancelled_at IS NULL AND day_date IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_allowance_corr_extra
  ON public.allowance_corrections (week_start, user_id)
  WHERE cancelled_at IS NULL AND day_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_allowance_corr_week ON public.allowance_corrections (week_start, user_id);

-- Rows can't be deleted or changed; the only change allowed is retiring a row once
CREATE OR REPLACE FUNCTION public.fn__allowance_corrections_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Allowance corrections cannot be deleted.';
  END IF;
  IF OLD.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'This allowance correction was already retired.';
  END IF;
  IF NEW.cancelled_at IS NULL
     OR (NEW.id, NEW.save_id, NEW.week_start, NEW.user_id, NEW.user_name, NEW.day_date, NEW.present, NEW.km,
         NEW.orig_present, NEW.orig_shifts, NEW.orig_km, NEW.extra_amount, NEW.reason, NEW.created_at, NEW.created_by, NEW.created_by_name)
        IS DISTINCT FROM
        (OLD.id, OLD.save_id, OLD.week_start, OLD.user_id, OLD.user_name, OLD.day_date, OLD.present, OLD.km,
         OLD.orig_present, OLD.orig_shifts, OLD.orig_km, OLD.extra_amount, OLD.reason, OLD.created_at, OLD.created_by, OLD.created_by_name) THEN
    RAISE EXCEPTION 'Allowance corrections cannot be changed.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_allowance_corrections_guard ON public.allowance_corrections;
CREATE TRIGGER trg_allowance_corrections_guard
  BEFORE UPDATE OR DELETE ON public.allowance_corrections
  FOR EACH ROW EXECUTE FUNCTION public.fn__allowance_corrections_guard();

ALTER TABLE public.allowance_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.allowance_corrections FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.allowance_corrections TO service_role;

-- -----------------------------------------------------------------------------
-- The version of one person's week: changes whenever anything is saved or reset.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_allowance_corr_token(p_week DATE, p_user UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*)::text || '|' || count(cancelled_at)::text
  FROM public.allowance_corrections
  WHERE week_start = p_week AND user_id = p_user;
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
             WHERE week_start = p_week AND user_id = p_user_id AND cancelled_at IS NULL) THEN
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
   WHERE week_start = p_week AND user_id = p_user_id AND cancelled_at IS NULL;

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
REVOKE ALL ON FUNCTION public.fn__allowance_corrections_guard() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Marking a week as paid and saving a correction can never overlap for the same
-- person: saving the paid record waits for a correction being saved right now
-- (and a correction saved right after is refused, because the week is paid).
-- Both take the same lock, so whichever comes first finishes first.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn__allowance_payout_wait_for_corrections()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('allowance_corr|' || NEW.week_start::text || '|' || NEW.user_id::text));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn__allowance_payout_wait_for_corrections() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.allowance_payouts') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_allowance_payout_wait_for_corrections ON public.allowance_payouts;
    CREATE TRIGGER trg_allowance_payout_wait_for_corrections
      BEFORE INSERT ON public.allowance_payouts
      FOR EACH ROW EXECUTE FUNCTION public.fn__allowance_payout_wait_for_corrections();
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
