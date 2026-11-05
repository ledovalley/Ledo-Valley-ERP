-- =============================================================================
-- Weekly allowance: weeks marked as paid keep their amounts for good
--
-- When the admin presses "Mark week as paid" on Sales > Allowances, each
-- person's figures for that week (days present, food rate and amount, km, km
-- rate and amount, total, and the day-by-day breakdown) are saved here. That
-- week then always shows these saved amounts: changing someone's rate later, or
-- editing a shift, never changes what a paid week shows.
--
-- Nothing is ever deleted. If a week was marked paid by mistake, "Undo paid"
-- (admin, delete password) marks those rows as cancelled, with who and when, and
-- the week can be marked paid again. The database itself refuses deleting rows
-- and refuses changing saved amounts.
--
-- Only the server (service role) can read or write this table; the server allows
-- admins only. No existing data is changed. Safe to run more than once.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.allowance_payouts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start      DATE NOT NULL,                 -- the Monday (India time)
  user_id         UUID NOT NULL,
  user_name       TEXT,
  days_present    INTEGER NOT NULL DEFAULT 0 CHECK (days_present >= 0),
  food_rate       NUMERIC NOT NULL DEFAULT 0 CHECK (food_rate >= 0),
  food_amount     NUMERIC NOT NULL DEFAULT 0 CHECK (food_amount >= 0),
  km              NUMERIC NOT NULL DEFAULT 0 CHECK (km >= 0),
  km_rate         NUMERIC NOT NULL DEFAULT 0 CHECK (km_rate >= 0),
  travel_amount   NUMERIC NOT NULL DEFAULT 0 CHECK (travel_amount >= 0),
  total_amount    NUMERIC NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  days            JSONB NOT NULL DEFAULT '[]'::jsonb,
  paid_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_by         UUID,
  paid_by_name    TEXT,
  cancelled_at    TIMESTAMPTZ,
  cancelled_by    UUID,
  cancelled_by_name TEXT,
  CHECK (EXTRACT(ISODOW FROM week_start) = 1)    -- always a Monday
);

-- A person can be paid only once per week (cancelled rows don't count)
CREATE UNIQUE INDEX IF NOT EXISTS uq_allowance_payouts_week_user
  ON public.allowance_payouts (week_start, user_id) WHERE cancelled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_allowance_payouts_week ON public.allowance_payouts (week_start);

-- Saved amounts can't be changed or deleted; the only change allowed is
-- cancelling a row once (Undo paid)
CREATE OR REPLACE FUNCTION public.fn__allowance_payouts_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Paid allowance records cannot be deleted. Use "Undo paid" instead.';
  END IF;
  IF OLD.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'This paid allowance record was already cancelled.';
  END IF;
  IF NEW.cancelled_at IS NULL
     OR (NEW.id, NEW.week_start, NEW.user_id, NEW.user_name, NEW.days_present, NEW.food_rate, NEW.food_amount,
         NEW.km, NEW.km_rate, NEW.travel_amount, NEW.total_amount, NEW.days, NEW.paid_at, NEW.paid_by, NEW.paid_by_name)
        IS DISTINCT FROM
        (OLD.id, OLD.week_start, OLD.user_id, OLD.user_name, OLD.days_present, OLD.food_rate, OLD.food_amount,
         OLD.km, OLD.km_rate, OLD.travel_amount, OLD.total_amount, OLD.days, OLD.paid_at, OLD.paid_by, OLD.paid_by_name) THEN
    RAISE EXCEPTION 'Paid allowance amounts cannot be changed.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_allowance_payouts_guard ON public.allowance_payouts;
CREATE TRIGGER trg_allowance_payouts_guard
  BEFORE UPDATE OR DELETE ON public.allowance_payouts
  FOR EACH ROW EXECUTE FUNCTION public.fn__allowance_payouts_guard();

ALTER TABLE public.allowance_payouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.allowance_payouts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.allowance_payouts TO service_role;
