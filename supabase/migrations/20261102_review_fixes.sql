-- =============================================================================
-- Migration: fixes from the review of commit 796dfd0 (1 Nov 2026)
--
-- Run AFTER all earlier migrations, including:
--   20261031_factory_security_hardening.sql
--   20261101_migrate_roles_to_app_metadata.sql
--   20261101_sales_shift_concurrency.sql
--   20261101_stock_take.sql
-- Safe on the live database (it upgrades from the state those leave) and on a
-- fresh install. Take a backup first (Dashboard > Database > Backups).
--
-- What this does (issue codes from the review PDF)
--   B1  Removes the duplicate / old create-blend functions
--   B2  History ids default in the database (stock take apply works)
--   B3  Adds fn_update_factory_blend (editing a blend)
--   D1  Returning stock to a deleted lot raises an error instead of losing it
--   D4  Adds fn_merge_factory_blends
--   S1  Stock functions: service role only (not logged-in users)
--   S2  Shift functions: caller's own active shift only, no negative amounts
--   S3  Copies pay settings (employment_type, base_rate, allowances) to app_metadata
--   A1  Serial numbers: rebuilt from blend names, unique, gap-free counter;
--       the name's "| SL-xx" is set by the database
--   A2  Finalize records include dates and lots (History screen)
--   A3  Bags validated and checked against stock; packet weight from the catalog;
--       total quantity = sum of the lots
--   F7  Lot labels saved with each blend
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Row-level security on the packet catalog (C4)
-- -----------------------------------------------------------------------------
ALTER TABLE public.factory_packet_catalog ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'factory_packet_catalog'
                   AND policyname = 'Allow authenticated read factory_packet_catalog') THEN
    CREATE POLICY "Allow authenticated read factory_packet_catalog"
      ON public.factory_packet_catalog FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
-- No insert/update/delete policies on any factory table: all writes go through
-- server actions using the service-role key.

-- History IDs: let the database generate them (M3)
ALTER TABLE public.factory_history
  ALTER COLUMN id SET DEFAULT ('hst-' || gen_random_uuid()::text);

-- -----------------------------------------------------------------------------
-- 2. Blend serial numbers owned by the database (H7)
-- -----------------------------------------------------------------------------
ALTER TABLE public.factory_blends ADD COLUMN IF NOT EXISTS serial_no INTEGER;

-- Rebuild serial_no from the "| SL-xx" in each blend's name, which is what was
-- printed and what people use. Blends without one keep any serial they have.
UPDATE public.factory_blends
   SET serial_no = (regexp_match(blend_name, '\|\s*SL-(\d+)\s*$'))[1]::int
 WHERE blend_name ~ '\|\s*SL-\d+\s*$';

-- If two blends share a serial, only the oldest keeps it (needed for the unique index)
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY serial_no ORDER BY created_at, id) AS rn
    FROM public.factory_blends
   WHERE serial_no IS NOT NULL
)
UPDATE public.factory_blends b
   SET serial_no = NULL
  FROM ranked r
 WHERE b.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_factory_blends_serial_no
  ON public.factory_blends(serial_no) WHERE serial_no IS NOT NULL;

-- Serial counter. A row lock (not a sequence) so that a failed blend attempt
-- rolls back and does not leave a false gap in Gap Analysis.
CREATE TABLE IF NOT EXISTS public.factory_serial_counter (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_serial INTEGER NOT NULL
);
ALTER TABLE public.factory_serial_counter ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.factory_serial_counter FROM PUBLIC, anon, authenticated;

-- Start above serials that only survive in history (packed or deleted blends).
INSERT INTO public.factory_serial_counter (id, last_serial)
SELECT 1, GREATEST(
  COALESCE((SELECT max(serial_no) FROM public.factory_blends), 0),
  COALESCE((SELECT max((regexp_match(details->>'blendName', '\|\s*SL-(\d+)\s*$'))[1]::int)
              FROM public.factory_history
             WHERE details->>'blendName' ~ '\|\s*SL-\d+\s*$'), 0))
ON CONFLICT (id) DO NOTHING;

-- Serials ever issued (blends table + history), for Gap Analysis
-- (Serials of blends that were merged into another blend count as issued, so
--  merging never shows up as a gap.)
CREATE OR REPLACE VIEW public.factory_issued_serials AS
  SELECT serial_no FROM public.factory_blends WHERE serial_no IS NOT NULL
  UNION
  SELECT (regexp_match(details->>'blendName', '\|\s*SL-(\d+)\s*$'))[1]::int
    FROM public.factory_history
   WHERE details->>'blendName' ~ '\|\s*SL-\d+\s*$'
  UNION
  SELECT (regexp_match(m.name, '\|\s*SL-(\d+)\s*$'))[1]::int
    FROM public.factory_history h,
         LATERAL jsonb_array_elements_text(COALESCE(h.details->'mergedBlendNames', '[]'::jsonb)) AS m(name)
   WHERE h.type = 'BLEND_MERGED'
     AND m.name ~ '\|\s*SL-\d+\s*$';

REVOKE ALL ON public.factory_issued_serials FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Replace the blend functions (C1, C3, H3, H4, M3)
--    Signatures change (history id no longer passed in), so drop first.
-- -----------------------------------------------------------------------------
-- B1: both versions of create (the original 9-argument one and the 10-argument one)
DROP FUNCTION IF EXISTS public.fn_create_factory_blend(TEXT, TEXT, TEXT, DATE, NUMERIC, UUID, JSONB, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.fn_create_factory_blend(TEXT, TEXT, TEXT, DATE, NUMERIC, UUID, JSONB, TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.fn_receive_packet_stock(TEXT, NUMERIC, DATE, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.fn_adjust_lot_weight(TEXT, NUMERIC, TEXT, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.fn_next_blend_serial();
DROP SEQUENCE IF EXISTS public.factory_blend_serial_seq;   -- replaced by factory_serial_counter
DROP FUNCTION IF EXISTS public.fn_finalize_factory_blend(TEXT, NUMERIC, TEXT, JSONB, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.fn_delete_factory_blend(TEXT, TEXT, UUID, TEXT);

-- Internal helper: validate and deduct a list of lots for a blend.
-- Returns the total weight deducted. Not callable through the API.
CREATE OR REPLACE FUNCTION public.fn__deduct_blend_lots(p_blend_id TEXT, p_lots JSONB)
RETURNS NUMERIC
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lot         JSONB;
  v_lot_id      TEXT;
  v_weight_used NUMERIC;
  v_bags_used   NUMERIC;
  v_current     RECORD;
  v_total       NUMERIC := 0;
BEGIN
  IF p_lots IS NULL OR jsonb_typeof(p_lots) <> 'array' OR jsonb_array_length(p_lots) = 0 THEN
    RAISE EXCEPTION 'A blend needs at least one lot.';
  END IF;

  FOR v_lot IN SELECT * FROM jsonb_array_elements(p_lots)
  LOOP
    v_lot_id      := v_lot->>'lotId';
    v_weight_used := NULLIF(v_lot->>'weightUsed', '')::NUMERIC;
    -- system lots historically sent '-' for bags
    v_bags_used   := COALESCE(NULLIF(NULLIF(v_lot->>'bagsUsed', '-'), '')::NUMERIC, 0);

    IF v_lot_id IS NULL THEN
      RAISE EXCEPTION 'Every lot in a blend needs a lot id.';
    END IF;
    IF v_weight_used IS NULL OR v_weight_used <= 0 THEN
      RAISE EXCEPTION 'Weight used must be greater than 0 for lot %.', v_lot_id;
    END IF;
    IF v_bags_used < 0 THEN
      RAISE EXCEPTION 'Bags used cannot be negative for lot %.', v_lot_id;
    END IF;

    SELECT * INTO v_current FROM factory_loose_lots WHERE id = v_lot_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lot % not found in inventory.', v_lot_id;
    END IF;

    IF v_current.weight < v_weight_used THEN
      RAISE EXCEPTION 'Insufficient weight for lot % (%). Available: % kg, requested: % kg.',
        v_current.lot_number, v_current.mark, v_current.weight, v_weight_used;
    END IF;
    IF v_bags_used > v_current.bags THEN
      RAISE EXCEPTION 'Insufficient bags for lot % (%). Available: %, requested: %.',
        v_current.lot_number, v_current.mark, v_current.bags, v_bags_used;
    END IF;

    UPDATE factory_loose_lots
       SET weight = weight - v_weight_used,
           bags   = bags - v_bags_used,
           updated_at = NOW()
     WHERE id = v_lot_id;

    INSERT INTO factory_blend_lots_used
      (blend_id, lot_id, lot_number, mark, grade, labels, bags_used, weight_used)
    VALUES
      (p_blend_id, v_lot_id, v_current.lot_number, v_current.mark, v_current.grade,
       COALESCE(v_current.labels, '{}'), v_bags_used, v_weight_used);

    v_total := v_total + v_weight_used;
  END LOOP;

  RETURN v_total;
END;
$$;

-- Internal helper: return every lot used by a blend to stock and clear the usage rows.
CREATE OR REPLACE FUNCTION public.fn__return_blend_lots(p_blend_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_used RECORD;
BEGIN
  FOR v_used IN SELECT * FROM factory_blend_lots_used WHERE blend_id = p_blend_id
  LOOP
    IF v_used.lot_id IS NULL THEN
      -- the lot was deleted after this blend was made: recreate nothing silently
      RAISE EXCEPTION 'Lot % (%) used by this blend no longer exists, so its stock cannot be returned. Recreate the lot or adjust stock manually first.',
        v_used.lot_number, v_used.mark;
    END IF;
    UPDATE factory_loose_lots
       SET weight = weight + v_used.weight_used,
           bags   = bags + COALESCE(v_used.bags_used, 0),
           updated_at = NOW()
     WHERE id = v_used.lot_id;
  END LOOP;

  DELETE FROM factory_blend_lots_used WHERE blend_id = p_blend_id;
END;
$$;

-- Internal helper: a blend's lots in the shape the History screen displays
-- (lotNumber, mark, bagsUsed, weightUsed, ...). System lots show bags as '-'.
CREATE OR REPLACE FUNCTION public.fn__blend_lots_json(p_blend_id TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'lotId', lot_id, 'lotNumber', lot_number, 'mark', mark, 'grade', grade,
           'labels', COALESCE(labels, '{}'),
           'bagsUsed', CASE WHEN lot_id LIKE 'l-%' THEN to_jsonb('-'::text) ELSE to_jsonb(bags_used) END,
           'weightUsed', weight_used)
         ORDER BY created_at, id), '[]'::jsonb)
    FROM factory_blend_lots_used
   WHERE blend_id = p_blend_id;
$$;

-- Create a blend atomically. The serial number is assigned here.
CREATE OR REPLACE FUNCTION public.fn_create_factory_blend(
  p_blend_id   TEXT,
  p_blend_name TEXT,
  p_batch_no   TEXT,
  p_date       DATE,
  p_lots       JSONB,  -- [{"lotId": "...", "bagsUsed": 2, "weightUsed": 50}]
  p_user_id    UUID,
  p_user_name  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_base   TEXT := btrim(regexp_replace(COALESCE(p_blend_name, ''), '\|\s*SL-\d+\s*$', ''));
  v_serial INTEGER;
  v_name   TEXT;
  v_total  NUMERIC;
BEGIN
  IF v_base = '' THEN
    RAISE EXCEPTION 'Blend name is required.';
  END IF;

  UPDATE factory_serial_counter SET last_serial = last_serial + 1
   WHERE id = 1 RETURNING last_serial INTO v_serial;
  v_name   := v_base || ' | SL-' || lpad(v_serial::text, 2, '0');

  INSERT INTO factory_blends (id, blend_name, batch_no, date, total_quantity, status, created_by, serial_no)
  VALUES (p_blend_id, v_name, p_batch_no, COALESCE(p_date, CURRENT_DATE), 0, 'PENDING', p_user_id, v_serial);

  v_total := fn__deduct_blend_lots(p_blend_id, p_lots);

  UPDATE factory_blends SET total_quantity = v_total WHERE id = p_blend_id;

  INSERT INTO factory_history (type, description, user_id, user_name, details)
  VALUES ('BLEND_INITIATED',
          format('Initiated blend instruction: %s (%s) for %s kg.', v_name, p_batch_no, v_total),
          p_user_id, p_user_name,
          jsonb_build_object('blendId', p_blend_id, 'blendName', v_name, 'batchNo', p_batch_no,
                             'serialNo', v_serial, 'date', COALESCE(p_date, CURRENT_DATE),
                             'totalQuantity', v_total, 'lotsUsed', fn__blend_lots_json(p_blend_id)));

  RETURN jsonb_build_object('success', true, 'blendId', p_blend_id, 'blendName', v_name,
                            'serialNo', v_serial, 'totalQuantity', v_total);
END;
$$;

-- Edit a PENDING blend: return its old lots, deduct the new ones, keep its serial.
CREATE OR REPLACE FUNCTION public.fn_update_factory_blend(
  p_blend_id   TEXT,
  p_blend_name TEXT,
  p_lots       JSONB,
  p_user_id    UUID,
  p_user_name  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_blend RECORD;
  v_base  TEXT := btrim(regexp_replace(COALESCE(p_blend_name, ''), '\|\s*SL-\d+\s*$', ''));
  v_name  TEXT;
  v_total NUMERIC;
BEGIN
  SELECT * INTO v_blend FROM factory_blends WHERE id = p_blend_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Blend % not found.', p_blend_id;
  END IF;
  IF v_blend.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Only blends under process can be edited (blend % is %).', p_blend_id, v_blend.status;
  END IF;
  IF v_base = '' THEN
    RAISE EXCEPTION 'Blend name is required.';
  END IF;

  v_name := CASE WHEN v_blend.serial_no IS NOT NULL
                 THEN v_base || ' | SL-' || lpad(v_blend.serial_no::text, 2, '0')
                 ELSE btrim(p_blend_name) END;

  PERFORM fn__return_blend_lots(p_blend_id);
  v_total := fn__deduct_blend_lots(p_blend_id, p_lots);

  UPDATE factory_blends
     SET blend_name = v_name, total_quantity = v_total, updated_at = NOW()
   WHERE id = p_blend_id;

  INSERT INTO factory_history (type, description, user_id, user_name, details)
  VALUES ('BLEND_UPDATED',
          format('Updated blend instruction: %s (%s) to %s kg.', v_name, v_blend.batch_no, v_total),
          p_user_id, p_user_name,
          jsonb_build_object('blendId', p_blend_id, 'blendName', v_name, 'batchNo', v_blend.batch_no,
                             'serialNo', v_blend.serial_no, 'date', v_blend.date,
                             'previousTotal', v_blend.total_quantity, 'totalQuantity', v_total,
                             'lotsUsed', fn__blend_lots_json(p_blend_id)));

  RETURN jsonb_build_object('success', true, 'blendId', p_blend_id, 'blendName', v_name,
                            'totalQuantity', v_total);
END;
$$;

-- Finalize (pack) a PENDING blend.
CREATE OR REPLACE FUNCTION public.fn_finalize_factory_blend(
  p_blend_id       TEXT,
  p_returned_loose NUMERIC,
  p_return_lot_id  TEXT,
  p_outputs        JSONB,  -- [{"productId": "...", "quantity": 10}]
  p_user_id        UUID,
  p_user_name      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_blend        RECORD;
  v_out          JSONB;
  v_qty          NUMERIC;
  v_product      RECORD;
  v_total_output NUMERIC := 0;
  v_items        JSONB := '[]'::jsonb;
  v_returned     NUMERIC := COALESCE(p_returned_loose, 0);
BEGIN
  SELECT * INTO v_blend FROM factory_blends WHERE id = p_blend_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Blend % not found.', p_blend_id;
  END IF;
  IF v_blend.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Blend % cannot be finalized from status %.', p_blend_id, v_blend.status;
  END IF;
  IF v_returned < 0 THEN
    RAISE EXCEPTION 'Returned loose weight cannot be negative.';
  END IF;
  IF (p_outputs IS NULL OR jsonb_array_length(p_outputs) = 0) AND v_returned = 0 THEN
    RAISE EXCEPTION 'Declare at least one packed product or returned loose weight.';
  END IF;

  FOR v_out IN SELECT * FROM jsonb_array_elements(COALESCE(p_outputs, '[]'::jsonb))
  LOOP
    v_qty := NULLIF(v_out->>'quantity', '')::NUMERIC;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Packed quantity must be greater than 0.';
    END IF;

    UPDATE factory_packet_catalog
       SET stock = stock + v_qty, updated_at = NOW()
     WHERE id = v_out->>'productId'
    RETURNING id, name, unit, size INTO v_product;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Packet product % does not exist.', v_out->>'productId';
    END IF;

    -- weight is computed from the catalog, not trusted from the browser
    v_total_output := v_total_output + v_qty * v_product.size;
    v_items := v_items || jsonb_build_object(
      'productId', v_product.id, 'productName', v_product.name, 'quantity', v_qty,
      'unit', v_product.unit, 'totalWeight', v_qty * v_product.size);
  END LOOP;

  IF v_returned > 0 THEN
    IF p_return_lot_id IS NULL THEN
      RAISE EXCEPTION 'A return lot is required when returning loose tea.';
    END IF;
    UPDATE factory_loose_lots
       SET weight = weight + v_returned, updated_at = NOW()
     WHERE id = p_return_lot_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Return lot % does not exist.', p_return_lot_id;
    END IF;
  END IF;

  UPDATE factory_blends SET status = 'PACKED', updated_at = NOW() WHERE id = p_blend_id;

  INSERT INTO factory_history (type, description, user_id, user_name, details)
  VALUES ('BLEND_PACKED',
          format('Finalized blend %s. Output: %s kg. Returned loose: %s kg.',
                 v_blend.blend_name, v_total_output, v_returned),
          p_user_id, p_user_name,
          jsonb_build_object('blendId', p_blend_id, 'blendName', v_blend.blend_name,
                             'batchNo', v_blend.batch_no, 'serialNo', v_blend.serial_no,
                             'date', v_blend.date, 'completedDate', CURRENT_DATE,
                             'totalQuantity', v_blend.total_quantity,
                             'lotsUsed', fn__blend_lots_json(p_blend_id),
                             'producedItems', v_items, 'returnedLooseWeight', v_returned,
                             'returnLotId', CASE WHEN v_returned > 0 THEN p_return_lot_id END,
                             'totalOutputQuantity', v_total_output));

  RETURN jsonb_build_object('success', true, 'totalOutputQuantity', v_total_output);
END;
$$;

-- Delete a PENDING blend and return its stock.
CREATE OR REPLACE FUNCTION public.fn_delete_factory_blend(
  p_blend_id  TEXT,
  p_user_id   UUID,
  p_user_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_blend RECORD;
  v_lots  JSONB;
BEGIN
  SELECT * INTO v_blend FROM factory_blends WHERE id = p_blend_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Blend % not found.', p_blend_id;
  END IF;
  IF v_blend.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Only blends under process can be deleted (blend % is %).', p_blend_id, v_blend.status;
  END IF;

  v_lots := fn__blend_lots_json(p_blend_id);
  PERFORM fn__return_blend_lots(p_blend_id);
  DELETE FROM factory_blends WHERE id = p_blend_id;

  INSERT INTO factory_history (type, description, user_id, user_name, details)
  VALUES ('BLEND_DELETED',
          format('Deleted blend %s and returned its stock.', v_blend.blend_name),
          p_user_id, p_user_name,
          jsonb_build_object('blendId', p_blend_id, 'blendName', v_blend.blend_name,
                             'batchNo', v_blend.batch_no, 'serialNo', v_blend.serial_no,
                             'date', v_blend.date, 'totalQuantity', v_blend.total_quantity,
                             'lotsUsed', v_lots));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Merge two or more PENDING blends into one new PENDING blend.
-- Stock was already deducted when the original blends were created, so no
-- stock moves here: the lot records are moved to the new blend and the
-- originals are removed. The new blend gets its own serial number.
CREATE OR REPLACE FUNCTION public.fn_merge_factory_blends(
  p_blend_ids    TEXT[],
  p_new_blend_id TEXT,
  p_user_id      UUID,
  p_user_name    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids     TEXT[];
  v_found   INTEGER;
  v_bad     RECORD;
  v_serial  INTEGER;
  v_base    TEXT;
  v_name    TEXT;
  v_batch   TEXT;
  v_total   NUMERIC;
  v_sources JSONB;
  v_names   JSONB;
  v_serials JSONB;
BEGIN
  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(p_blend_ids) AS x WHERE x IS NOT NULL;
  IF v_ids IS NULL OR array_length(v_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Select at least 2 different blends to merge.';
  END IF;

  -- Lock every source blend (in a fixed order, so two merges can't deadlock)
  PERFORM 1 FROM factory_blends WHERE id = ANY(v_ids) ORDER BY id FOR UPDATE;

  SELECT count(*) INTO v_found FROM factory_blends WHERE id = ANY(v_ids);
  IF v_found <> array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'One or more of the selected blends no longer exist. Refresh and try again.';
  END IF;

  SELECT id, blend_name, status INTO v_bad
    FROM factory_blends WHERE id = ANY(v_ids) AND status <> 'PENDING' LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Blend % is %, only blends under process can be merged.', v_bad.blend_name, v_bad.status;
  END IF;

  -- Each part keeps its serial, e.g. "Merged: Assam Gold (SL-01) + Assam Gold (SL-02)"
  SELECT
    'Merged: ' || string_agg(
      btrim(regexp_replace(blend_name, '\|\s*SL-\d+\s*$', ''))
        || CASE
             WHEN serial_no IS NOT NULL THEN ' (SL-' || lpad(serial_no::text, 2, '0') || ')'
             WHEN blend_name ~ '\|\s*SL-\d+\s*$'
               THEN ' (SL-' || (regexp_match(blend_name, '\|\s*SL-(\d+)\s*$'))[1] || ')'
             ELSE ''
           END,
      ' + ' ORDER BY created_at, id),
    string_agg(DISTINCT NULLIF(batch_no, ''), ', '),
    sum(total_quantity),
    jsonb_agg(jsonb_build_object('blendId', id, 'blendName', blend_name, 'batchNo', batch_no,
                                 'serialNo', serial_no, 'totalQuantity', total_quantity)
              ORDER BY created_at, id),
    jsonb_agg(blend_name ORDER BY created_at, id),
    COALESCE(jsonb_agg(
      CASE
        WHEN serial_no IS NOT NULL THEN 'SL-' || lpad(serial_no::text, 2, '0')
        WHEN blend_name ~ '\|\s*SL-\d+\s*$' THEN 'SL-' || (regexp_match(blend_name, '\|\s*SL-(\d+)\s*$'))[1]
      END ORDER BY created_at, id) FILTER (WHERE serial_no IS NOT NULL OR blend_name ~ '\|\s*SL-\d+\s*$'),
      '[]'::jsonb)
  INTO v_base, v_batch, v_total, v_sources, v_names, v_serials
  FROM factory_blends WHERE id = ANY(v_ids);

  UPDATE factory_serial_counter SET last_serial = last_serial + 1
   WHERE id = 1 RETURNING last_serial INTO v_serial;
  v_name := v_base || ' | SL-' || lpad(v_serial::text, 2, '0');

  INSERT INTO factory_blends (id, blend_name, batch_no, date, total_quantity, status, created_by, serial_no)
  VALUES (p_new_blend_id, v_name, COALESCE(v_batch, 'MERGED'), CURRENT_DATE, v_total, 'PENDING', p_user_id, v_serial);

  -- Move the lot records to the new blend (stock stays as it is)
  UPDATE factory_blend_lots_used SET blend_id = p_new_blend_id WHERE blend_id = ANY(v_ids);

  DELETE FROM factory_blends WHERE id = ANY(v_ids);

  INSERT INTO factory_history (type, description, user_id, user_name, details)
  VALUES ('BLEND_MERGED',
          format('Merged %s into %s (%s kg).',
                 COALESCE(NULLIF((SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(v_serials) AS x), ''),
                          array_length(v_ids, 1) || ' blends'),
                 v_name, v_total),
          p_user_id, p_user_name,
          jsonb_build_object('blendId', p_new_blend_id, 'blendName', v_name, 'batchNo', v_batch,
                             'serialNo', v_serial, 'date', CURRENT_DATE, 'totalQuantity', v_total,
                             'lotsUsed', fn__blend_lots_json(p_new_blend_id),
                             'mergedSerials', v_serials,
                             'mergedBlends', v_sources, 'mergedBlendNames', v_names));

  RETURN jsonb_build_object('success', true, 'blendId', p_new_blend_id, 'blendName', v_name,
                            'serialNo', v_serial, 'totalQuantity', v_total);
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Atomic stock changes (H5)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_receive_packet_stock(
  p_product_id TEXT,
  p_qty        NUMERIC,
  p_date       DATE,
  p_user_id    UUID,
  p_user_name  TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row RECORD;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0.';
  END IF;

  UPDATE factory_packet_catalog
     SET stock = stock + p_qty, updated_at = NOW()
   WHERE id = p_product_id
  RETURNING name, unit, stock INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product % not found in packet catalog.', p_product_id;
  END IF;

  INSERT INTO factory_history (type, description, user_id, user_name, details)
  VALUES ('PACKET_STOCK_RECEIVED',
          format('Received %s %s(s) of "%s". New stock: %s', p_qty, v_row.unit, v_row.name, v_row.stock),
          p_user_id, p_user_name,
          jsonb_build_object('productId', p_product_id, 'productName', v_row.name,
                             'addedQuantity', p_qty, 'newStock', v_row.stock, 'date', p_date));

  RETURN v_row.stock;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_adjust_lot_weight(
  p_lot_id    TEXT,
  p_amount    NUMERIC,
  p_reason    TEXT,
  p_user_id   UUID,
  p_user_name TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lot RECORD;
  v_new NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount = 0 THEN
    RAISE EXCEPTION 'Adjustment amount must be a non-zero number.';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required for every adjustment.';
  END IF;

  SELECT * INTO v_lot FROM factory_loose_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lot % not found.', p_lot_id;
  END IF;
  IF v_lot.weight + p_amount < 0 THEN
    RAISE EXCEPTION 'Adjustment would make % negative (current % kg).', v_lot.mark, v_lot.weight;
  END IF;

  v_new := round(v_lot.weight + p_amount, 3);
  UPDATE factory_loose_lots SET weight = v_new, updated_at = NOW() WHERE id = p_lot_id;

  INSERT INTO factory_history (type, description, user_id, user_name, details)
  VALUES ('LEDGER_ADJUSTMENT',
          format('Adjusted %s (%s) by %s%s kg. Reason: %s', v_lot.mark, v_lot.lot_number,
                 CASE WHEN p_amount > 0 THEN '+' ELSE '' END, p_amount, p_reason),
          p_user_id, p_user_name,
          jsonb_build_object('target_id', p_lot_id, 'mark', v_lot.mark, 'lot_number', v_lot.lot_number,
                             'targetName', v_lot.mark, 'amount', p_amount,
                             'prev_weight', v_lot.weight, 'adjustment_amount', p_amount,
                             'new_weight', v_new, 'reason', p_reason));

  RETURN v_new;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Shift counters (S2): same names and signatures as 20261101_sales_shift_concurrency.sql,
--    now limited to the caller's own active or paused shift, with no negative amounts.
--    SECURITY INVOKER: runs as the logged-in user, so the shifts table's own rules apply.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_record_sale_on_shift(
    p_shift_id      UUID,
    p_order_value   NUMERIC,
    p_cash_amount   NUMERIC,
    p_online_amount NUMERIC,
    p_due_amount    NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_shift_id IS NULL THEN
        RAISE EXCEPTION 'No shift given.';
    END IF;
    IF COALESCE(p_order_value, 0) < 0 OR COALESCE(p_cash_amount, 0) < 0
       OR COALESCE(p_online_amount, 0) < 0 OR COALESCE(p_due_amount, 0) < 0 THEN
        RAISE EXCEPTION 'Amounts cannot be negative.';
    END IF;

    UPDATE public.shifts
       SET orders_count      = COALESCE(orders_count, 0) + 1,
           visits_count      = COALESCE(visits_count, 0) + 1,
           total_order_value = COALESCE(total_order_value, 0) + COALESCE(p_order_value, 0),
           cash_collected    = COALESCE(cash_collected, 0)    + COALESCE(p_cash_amount, 0),
           online_collected  = COALESCE(online_collected, 0)  + COALESCE(p_online_amount, 0),
           market_due        = COALESCE(market_due, 0)        + COALESCE(p_due_amount, 0)
     WHERE id = p_shift_id
       AND user_id::text = auth.uid()::text
       AND status IN ('active', 'paused');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Shift not found, not yours, or not active.';
    END IF;
    RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_increment_shift_visits(p_shift_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE public.shifts
       SET visits_count = COALESCE(visits_count, 0) + 1
     WHERE id = p_shift_id
       AND user_id::text = auth.uid()::text
       AND status IN ('active', 'paused');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Shift not found, not yours, or not active.';
    END IF;
    RETURN jsonb_build_object('success', true);
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Lock down who can call what (C3)
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn__deduct_blend_lots(TEXT, JSONB)                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn__return_blend_lots(TEXT)                                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn__blend_lots_json(TEXT)                                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_create_factory_blend(TEXT, TEXT, TEXT, DATE, JSONB, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_update_factory_blend(TEXT, TEXT, JSONB, UUID, TEXT)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_finalize_factory_blend(TEXT, NUMERIC, TEXT, JSONB, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_delete_factory_blend(TEXT, UUID, TEXT)                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_merge_factory_blends(TEXT[], TEXT, UUID, TEXT)            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_receive_packet_stock(TEXT, NUMERIC, DATE, UUID, TEXT)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_adjust_lot_weight(TEXT, NUMERIC, TEXT, UUID, TEXT)       FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.fn__deduct_blend_lots(TEXT, JSONB),
  public.fn__return_blend_lots(TEXT),
  public.fn__blend_lots_json(TEXT),
  public.fn_create_factory_blend(TEXT, TEXT, TEXT, DATE, JSONB, UUID, TEXT),
  public.fn_update_factory_blend(TEXT, TEXT, JSONB, UUID, TEXT),
  public.fn_finalize_factory_blend(TEXT, NUMERIC, TEXT, JSONB, UUID, TEXT),
  public.fn_delete_factory_blend(TEXT, UUID, TEXT),
  public.fn_merge_factory_blends(TEXT[], TEXT, UUID, TEXT),
  public.fn_receive_packet_stock(TEXT, NUMERIC, DATE, UUID, TEXT),
  public.fn_adjust_lot_weight(TEXT, NUMERIC, TEXT, UUID, TEXT)
TO service_role;

GRANT SELECT ON public.factory_issued_serials TO service_role;
GRANT SELECT, UPDATE ON public.factory_serial_counter TO service_role;

-- Shift counters are called by logged-in sales staff (for their own shift), never anonymously
REVOKE EXECUTE ON FUNCTION public.fn_record_sale_on_shift(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_increment_shift_visits(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_record_sale_on_shift(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.fn_increment_shift_visits(UUID) TO authenticated, service_role;

-- Stock take: unchanged, but make sure only the server can run it
REVOKE EXECUTE ON FUNCTION public.fn_apply_stock_take(TEXT, JSONB, BOOLEAN, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_apply_stock_take(TEXT, JSONB, BOOLEAN, UUID, TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- 7. Pay settings to app_metadata (S3). 20261101_migrate_roles_to_app_metadata.sql
--    copied only the role; users could still change their own pay rate. Values
--    already in app_metadata are kept. Nothing is removed from user_metadata.
-- -----------------------------------------------------------------------------
UPDATE auth.users
   SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
         'employment_type', COALESCE(raw_app_meta_data->'employment_type', raw_user_meta_data->'employment_type'),
         'base_rate',       COALESCE(raw_app_meta_data->'base_rate',       raw_user_meta_data->'base_rate'),
         'allowances',      COALESCE(raw_app_meta_data->'allowances',      raw_user_meta_data->'allowances')))
 WHERE raw_user_meta_data ?| ARRAY['employment_type', 'base_rate', 'allowances'];

COMMIT;

-- -----------------------------------------------------------------------------
-- After running, check (should return no rows):
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false;
--   SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.prosecdef
--      AND has_function_privilege('anon', p.oid, 'EXECUTE');
-- -----------------------------------------------------------------------------
