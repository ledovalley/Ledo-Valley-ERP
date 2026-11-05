-- =============================================================================
-- Factory speed: keeps the factory screens fast as data grows over the years
--
-- Measured on a copy with 3 years of data (6,000 lots, 9,000 blends, 27,000
-- history entries), before -> after:
--   - Refresh after every save: 20 requests one after another -> 5 at once
--   - Applying a stock take: about 11 s -> well under a second
--   - "Clear empty lots": about 14 s -> about 1 s
--
-- 1. Index for "which blends used this lot" (lot delete, clear empty lots, lot audit)
-- 2. Gap Analysis worked out inside the database (was: every serial number ever
--    issued downloaded 1,000 at a time)
-- 3. All lots in one request (was: 1,000 at a time, one after another)
-- 4. Stock take apply: the reviewed figures are read in one step (was: one lot at
--    a time, getting slower the more lots there are)
--
-- Read-only apart from the new index and functions: no data is changed.
-- Safe to run more than once. The app keeps working before this is run (slower).
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_factory_blend_lots_lot_id ON public.factory_blend_lots_used (lot_id);
CREATE INDEX IF NOT EXISTS idx_factory_history_type ON public.factory_history (type);

-- Gap Analysis: serial numbers between 1 and the highest issued that were never issued
CREATE OR REPLACE FUNCTION public.fn_factory_missing_serials()
RETURNS INTEGER[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH issued AS (SELECT DISTINCT serial_no FROM factory_issued_serials WHERE serial_no > 0)
  SELECT COALESCE(array_agg(g ORDER BY g), '{}')
    FROM generate_series(1, (SELECT COALESCE(max(serial_no), 0) FROM issued)) g
   WHERE NOT EXISTS (SELECT 1 FROM issued i WHERE i.serial_no = g);
$$;
REVOKE ALL ON FUNCTION public.fn_factory_missing_serials() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_factory_missing_serials() TO service_role;

-- Every loose lot, newest first, in one request (same columns as before)
CREATE OR REPLACE FUNCTION public.fn_factory_loose_lots()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', id, 'lot_number', lot_number, 'mark', mark, 'grade', grade, 'bags', bags,
           'weight_per_bag', weight_per_bag, 'weight', weight, 'date', date, 'labels', labels)
           ORDER BY created_at DESC NULLS LAST, id), '[]'::jsonb)
    FROM factory_loose_lots;
$$;
REVOKE ALL ON FUNCTION public.fn_factory_loose_lots() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_factory_loose_lots() TO authenticated, service_role;

-- Stock take apply (same as 20261101_stock_take.sql, with the reviewed figures read in one step)
CREATE OR REPLACE FUNCTION public.fn_apply_stock_take(
  p_take_id        TEXT,
  p_expected       JSONB,
  p_zero_uncounted BOOLEAN,
  p_user_id        UUID,
  p_user_name      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_take      RECORD;
  v_count     RECORD;
  v_lot       RECORD;
  v_exp       JSONB;
  v_expected  JSONB := '{}'::jsonb;   -- lotId -> {bags, weight}
  v_new_id    TEXT;
  v_label     TEXT;
  v_diff      NUMERIC;
  n_match     INTEGER := 0;  n_excess  INTEGER := 0;  n_short INTEGER := 0;
  n_missing   INTEGER := 0;  n_new     INTEGER := 0;
  kg_excess   NUMERIC := 0;  kg_short  NUMERIC := 0;
  kg_missing  NUMERIC := 0;  kg_new    NUMERIC := 0;
  v_summary   JSONB;
BEGIN
  SELECT * INTO v_take FROM factory_stock_takes WHERE id = p_take_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock take % not found.', p_take_id;
  END IF;
  IF v_take.status <> 'OPEN' THEN
    RAISE EXCEPTION 'This stock take is already %.', lower(v_take.status);
  END IF;

  SELECT COALESCE(jsonb_object_agg(e->>'lotId', e), '{}'::jsonb) INTO v_expected
    FROM jsonb_array_elements(COALESCE(p_expected, '[]'::jsonb)) e
   WHERE e->>'lotId' IS NOT NULL;

  v_label := 'Stock take ' || to_char(v_take.started_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY');

  -- 1. Counted lots that exist in the system
  FOR v_count IN
    SELECT * FROM factory_stock_take_counts
     WHERE stock_take_id = p_take_id AND lot_id IS NOT NULL
     ORDER BY lot_id
  LOOP
    SELECT * INTO v_lot FROM factory_loose_lots WHERE id = v_count.lot_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lot % (%) was deleted after it was counted. Remove its count or enter it as a new lot.',
        v_count.lot_number, v_count.mark;
    END IF;

    IF NOT (v_expected ? v_lot.id)
       OR (v_expected->v_lot.id->>'weight')::numeric IS DISTINCT FROM v_lot.weight
       OR (v_expected->v_lot.id->>'bags')::numeric IS DISTINCT FROM v_lot.bags THEN
      RAISE EXCEPTION 'Lot % (%) changed after you reviewed the count (now % bags / % kg). Review again before updating.',
        v_lot.lot_number, v_lot.mark, v_lot.bags, v_lot.weight;
    END IF;

    v_diff := v_count.counted_weight - v_lot.weight;

    IF v_count.counted_weight = v_lot.weight AND v_count.counted_bags = v_lot.bags THEN
      n_match := n_match + 1;
      CONTINUE;
    END IF;

    IF v_count.counted_weight = 0 AND v_count.counted_bags = 0 THEN
      n_missing := n_missing + 1;  kg_missing := kg_missing + v_lot.weight;
    ELSIF v_diff > 0 OR (v_diff = 0 AND v_count.counted_bags > v_lot.bags) THEN
      n_excess := n_excess + 1;    kg_excess := kg_excess + v_diff;
    ELSE
      n_short := n_short + 1;      kg_short := kg_short - v_diff;
    END IF;

    UPDATE factory_loose_lots
       SET bags = v_count.counted_bags, weight = v_count.counted_weight, updated_at = NOW()
     WHERE id = v_lot.id;

    INSERT INTO factory_history (type, description, user_id, user_name, details)
    VALUES ('LOT_STOCK_CORRECTED',
            format('%s: lot %s (%s) from %s bags / %s kg to %s bags / %s kg',
                   v_label, v_lot.lot_number, v_lot.mark, v_lot.bags, v_lot.weight,
                   v_count.counted_bags, v_count.counted_weight),
            p_user_id, p_user_name,
            jsonb_build_object('lotId', v_lot.id, 'stockTakeId', p_take_id,
                               'before', jsonb_build_object('bags', v_lot.bags, 'weight', v_lot.weight),
                               'after',  jsonb_build_object('bags', v_count.counted_bags, 'weight', v_count.counted_weight),
                               'note', v_count.note));
  END LOOP;

  -- 2. Lots with stock that were not counted at all: missing
  IF p_zero_uncounted THEN
    FOR v_lot IN
      SELECT l.* FROM factory_loose_lots l
       WHERE (l.weight > 0 OR l.bags > 0)
         AND NOT EXISTS (SELECT 1 FROM factory_stock_take_counts c
                          WHERE c.stock_take_id = p_take_id AND c.lot_id = l.id)
       ORDER BY l.id
       FOR UPDATE
    LOOP
      -- A lot that appeared after the review is left alone (it wasn't on the list)
      IF NOT (v_expected ? v_lot.id) THEN
        CONTINUE;
      END IF;
      IF (v_expected->v_lot.id->>'weight')::numeric IS DISTINCT FROM v_lot.weight
         OR (v_expected->v_lot.id->>'bags')::numeric IS DISTINCT FROM v_lot.bags THEN
        RAISE EXCEPTION 'Lot % (%) changed after you reviewed the count (now % bags / % kg). Review again before updating.',
          v_lot.lot_number, v_lot.mark, v_lot.bags, v_lot.weight;
      END IF;

      n_missing := n_missing + 1;  kg_missing := kg_missing + v_lot.weight;

      UPDATE factory_loose_lots SET bags = 0, weight = 0, updated_at = NOW() WHERE id = v_lot.id;

      INSERT INTO factory_history (type, description, user_id, user_name, details)
      VALUES ('LOT_STOCK_CORRECTED',
              format('%s: lot %s (%s) not found, %s bags / %s kg set to 0',
                     v_label, v_lot.lot_number, v_lot.mark, v_lot.bags, v_lot.weight),
              p_user_id, p_user_name,
              jsonb_build_object('lotId', v_lot.id, 'stockTakeId', p_take_id, 'notCounted', true,
                                 'before', jsonb_build_object('bags', v_lot.bags, 'weight', v_lot.weight),
                                 'after',  jsonb_build_object('bags', 0, 'weight', 0)));
    END LOOP;
  END IF;

  -- 3. Lots found that are not in the system: create them
  FOR v_count IN
    SELECT * FROM factory_stock_take_counts
     WHERE stock_take_id = p_take_id AND lot_id IS NULL
     ORDER BY updated_at, id
  LOOP
    IF v_count.counted_weight <= 0 THEN
      CONTINUE;
    END IF;
    v_new_id := 'lot-' || gen_random_uuid()::text;

    INSERT INTO factory_loose_lots (id, lot_number, grade, mark, bags, weight_per_bag, weight, date, labels)
    VALUES (v_new_id, v_count.lot_number, COALESCE(NULLIF(v_count.grade, ''), '-'), v_count.mark,
            v_count.counted_bags, COALESCE(v_count.weight_per_bag, 0), v_count.counted_weight,
            CURRENT_DATE, ARRAY['Found in stock take']);

    UPDATE factory_stock_take_counts SET lot_id = v_new_id WHERE id = v_count.id;

    n_new := n_new + 1;  kg_new := kg_new + v_count.counted_weight;

    INSERT INTO factory_history (type, description, user_id, user_name, details)
    VALUES ('LOT_ADDED',
            format('%s: found lot %s (%s) not in the system - %s bags, %s kg',
                   v_label, v_count.lot_number, v_count.mark, v_count.counted_bags, v_count.counted_weight),
            p_user_id, p_user_name,
            jsonb_build_object('id', v_new_id, 'lot_number', v_count.lot_number, 'mark', v_count.mark,
                               'grade', v_count.grade, 'bags', v_count.counted_bags,
                               'weight_per_bag', v_count.weight_per_bag, 'weight', v_count.counted_weight,
                               'stockTakeId', p_take_id, 'foundInStockTake', true, 'note', v_count.note));
  END LOOP;

  v_summary := jsonb_build_object(
    'match', n_match, 'excess', n_excess, 'short', n_short, 'missing', n_missing, 'new', n_new,
    'excessKg', kg_excess, 'shortKg', kg_short, 'missingKg', kg_missing, 'newKg', kg_new,
    'netKg', kg_excess + kg_new - kg_short - kg_missing,
    'zeroUncounted', p_zero_uncounted);

  UPDATE factory_stock_takes
     SET status = 'APPLIED', closed_at = NOW(), closed_by = p_user_id, closed_by_name = p_user_name,
         summary = v_summary
   WHERE id = p_take_id;

  INSERT INTO factory_history (type, description, user_id, user_name, details)
  VALUES ('STOCK_TAKE_APPLIED',
          format('%s applied: %s matched, %s excess (+%s kg), %s short (-%s kg), %s missing (-%s kg), %s new lots (+%s kg).',
                 v_label, n_match, n_excess, kg_excess, n_short, kg_short, n_missing, kg_missing, n_new, kg_new),
          p_user_id, p_user_name,
          jsonb_build_object('stockTakeId', p_take_id) || v_summary);

  RETURN jsonb_build_object('success', true) || v_summary;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_apply_stock_take(TEXT, JSONB, BOOLEAN, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_apply_stock_take(TEXT, JSONB, BOOLEAN, UUID, TEXT) TO service_role;
