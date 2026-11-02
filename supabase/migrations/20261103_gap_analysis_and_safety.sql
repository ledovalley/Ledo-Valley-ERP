-- =============================================================================
-- 1) Gap Analysis: keep a permanent record of every serial number issued.
-- 2) Safety guards against losing lots, finalized blends or history (end of file).
--
-- Before: Gap Analysis worked out which serials exist from the blends table plus
-- names found in history. If a blend left the blends table (merged, or removed by
-- an older version of a function) and its history row didn't carry the name in the
-- expected form, its serial showed as a false gap.
--
-- Now: a trigger writes each serial into factory_serial_log the moment a blend row
-- gets one. Rows in the log are never updated or deleted, so merging, finalizing or
-- deleting a blend can never make its serial look missing. A real gap now only
-- means a serial that never reached the database.
--
-- Safe to run more than once.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.factory_serial_log (
  serial_no  INTEGER PRIMARY KEY,
  blend_id   TEXT,
  blend_name TEXT,
  issued_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.factory_serial_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.factory_serial_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.factory_serial_log TO service_role;

-- Record a serial whenever a blend row is created with one or given one.
CREATE OR REPLACE FUNCTION public.fn__log_blend_serial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.serial_no IS NOT NULL THEN
    INSERT INTO factory_serial_log (serial_no, blend_id, blend_name)
    VALUES (NEW.serial_no, NEW.id, NEW.blend_name)
    ON CONFLICT (serial_no) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn__log_blend_serial() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_factory_blends_log_serial ON public.factory_blends;
CREATE TRIGGER trg_factory_blends_log_serial
  AFTER INSERT OR UPDATE OF serial_no ON public.factory_blends
  FOR EACH ROW EXECUTE FUNCTION public.fn__log_blend_serial();

-- The log can't be edited, even with the service key (only the table owner,
-- e.g. a TRUNCATE when wiping data, can clear it).
CREATE OR REPLACE FUNCTION public.fn__serial_log_read_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'factory_serial_log is a permanent record and cannot be changed.';
END;
$$;
DROP TRIGGER IF EXISTS trg_factory_serial_log_read_only ON public.factory_serial_log;
CREATE TRIGGER trg_factory_serial_log_read_only
  BEFORE UPDATE OR DELETE ON public.factory_serial_log
  FOR EACH ROW EXECUTE FUNCTION public.fn__serial_log_read_only();

-- Every serial the database can still find, from all sources.
CREATE OR REPLACE VIEW public.factory_issued_serials AS
  SELECT serial_no FROM public.factory_serial_log
  UNION
  SELECT serial_no FROM public.factory_blends WHERE serial_no IS NOT NULL
  UNION
  -- serialNo stored in history details
  SELECT (details->>'serialNo')::int
    FROM public.factory_history
   WHERE details->>'serialNo' ~ '^\d+$'
  UNION
  -- "| SL-xx" at the end of a blend name in history
  SELECT (regexp_match(details->>'blendName', '\|\s*SL-(\d+)\s*$'))[1]::int
    FROM public.factory_history
   WHERE details->>'blendName' ~ '\|\s*SL-\d+\s*$'
  UNION
  -- serials of the blends that went into a merge
  SELECT (regexp_match(s, '(\d+)\s*$'))[1]::int
    FROM public.factory_history h,
         LATERAL jsonb_array_elements_text(COALESCE(h.details->'mergedSerials', '[]'::jsonb)) AS x(s)
   WHERE h.type = 'BLEND_MERGED' AND s ~ '\d+\s*$'
  UNION
  SELECT (m->>'serialNo')::int
    FROM public.factory_history h,
         LATERAL jsonb_array_elements(COALESCE(h.details->'mergedBlends', '[]'::jsonb)) AS y(m)
   WHERE h.type = 'BLEND_MERGED' AND m->>'serialNo' ~ '^\d+$'
  UNION
  SELECT (regexp_match(n, '\|\s*SL-(\d+)\s*$'))[1]::int
    FROM public.factory_history h,
         LATERAL jsonb_array_elements_text(COALESCE(h.details->'mergedBlendNames', '[]'::jsonb)) AS z(n)
   WHERE h.type = 'BLEND_MERGED' AND n ~ '\|\s*SL-\d+\s*$';

REVOKE ALL ON public.factory_issued_serials FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.factory_issued_serials TO service_role;

-- Fill the log from everything known today, so existing blends are covered too.
INSERT INTO public.factory_serial_log (serial_no)
SELECT serial_no FROM public.factory_issued_serials WHERE serial_no IS NOT NULL
ON CONFLICT (serial_no) DO NOTHING;


-- =============================================================================
-- Safety guards: the database itself refuses changes that would lose records,
-- whether they come from the app, a bug, or a click in the Supabase table editor.
-- (TRUNCATE, used when wiping all data on purpose, is not affected.)
-- =============================================================================

-- 1. A lot used by a blend under process can't be deleted. Without this, the
--    blend would lose its link to the lot (lot_id set to NULL) and its tea could
--    never be returned. Checked at delete time, so two people acting at the same
--    moment can't slip past it.
CREATE OR REPLACE FUNCTION public.fn__guard_lot_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_blend TEXT;
BEGIN
  SELECT b.blend_name INTO v_blend
    FROM factory_blend_lots_used u
    JOIN factory_blends b ON b.id = u.blend_id
   WHERE u.lot_id = OLD.id AND b.status = 'PENDING'
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Lot % (%) is used by blend "%", which is still under process. Finalize or delete that blend first.',
      OLD.lot_number, OLD.mark, v_blend;
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_factory_loose_lots_guard_delete ON public.factory_loose_lots;
CREATE TRIGGER trg_factory_loose_lots_guard_delete
  BEFORE DELETE ON public.factory_loose_lots
  FOR EACH ROW EXECUTE FUNCTION public.fn__guard_lot_delete();

-- 2. Finalized (packed) blends are the production record and are never deleted.
--    Deleting one would also delete the list of lots it used.
CREATE OR REPLACE FUNCTION public.fn__guard_blend_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'PENDING' THEN
    RAISE EXCEPTION 'Blend % is %. Only blends under process can be deleted.', OLD.blend_name, OLD.status;
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_factory_blends_guard_delete ON public.factory_blends;
CREATE TRIGGER trg_factory_blends_guard_delete
  BEFORE DELETE ON public.factory_blends
  FOR EACH ROW EXECUTE FUNCTION public.fn__guard_blend_delete();

-- 3. History is the audit trail: rows can be added, never changed or deleted.
CREATE OR REPLACE FUNCTION public.fn__history_read_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'factory_history is a permanent record and cannot be changed or deleted.';
END;
$$;
DROP TRIGGER IF EXISTS trg_factory_history_read_only ON public.factory_history;
CREATE TRIGGER trg_factory_history_read_only
  BEFORE UPDATE OR DELETE ON public.factory_history
  FOR EACH ROW EXECUTE FUNCTION public.fn__history_read_only();

REVOKE ALL ON FUNCTION public.fn__guard_lot_delete(), public.fn__guard_blend_delete(),
                       public.fn__history_read_only(), public.fn__serial_log_read_only()
  FROM PUBLIC, anon, authenticated;
