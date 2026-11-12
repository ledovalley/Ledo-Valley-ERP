-- =============================================================================
-- Packet stock: set every packet product to zero in one step, except the
-- short / excess item (the system variance ledger 'p-variance', and any product
-- whose name says short + excess).
--
-- Safe:
--   * All or nothing, in one transaction. Rows are locked while it runs, so a
--     blend being packed at the same moment either finishes first or waits.
--   * Only goes ahead if every stock is still what the person saw on screen
--     (p_expected). If anything changed, nothing is changed.
--   * Writes one permanent history entry listing every product and the stock
--     it had before, so the old figures are never lost.
--   * Only the server can run it (not callable from the browser).
--
-- Adds a function only. Changes no data when run. Safe to run more than once.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_zero_packet_stock(
  p_expected  JSONB,   -- [{ "id": "...", "stock": 12 }, ...] as shown on screen
  p_user_id   UUID,
  p_user_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row      RECORD;
  v_expected JSONB := '{}'::jsonb;
  v_items    JSONB := '[]'::jsonb;
  v_kept     JSONB := '[]'::jsonb;
  v_ids      TEXT[] := ARRAY[]::TEXT[];
  v_units    NUMERIC := 0;
  v_kg       NUMERIC := 0;
BEGIN
  IF p_expected IS NULL OR jsonb_typeof(p_expected) <> 'array' THEN
    RAISE EXCEPTION 'Missing the stock shown on screen. Refresh and try again. Nothing was changed.';
  END IF;

  SELECT COALESCE(jsonb_object_agg(e->>'id', (e->>'stock')::NUMERIC), '{}'::jsonb)
    INTO v_expected
    FROM jsonb_array_elements(p_expected) e
   WHERE e->>'id' IS NOT NULL;

  -- Lock every packet product until this finishes
  PERFORM 1 FROM factory_packet_catalog ORDER BY id FOR UPDATE;

  FOR v_row IN
    SELECT id, name, unit, size, stock FROM factory_packet_catalog ORDER BY name, id
  LOOP
    IF v_row.id = 'p-variance' OR v_row.name ~* 'short.*excess|excess.*short' THEN
      v_kept := v_kept || jsonb_build_object('productId', v_row.id, 'productName', v_row.name, 'stock', v_row.stock);
      CONTINUE;
    END IF;
    IF v_row.stock = 0 THEN
      CONTINUE;
    END IF;
    -- Must still be what the person saw
    IF NOT (v_expected ? v_row.id) OR (v_expected->>v_row.id)::NUMERIC <> v_row.stock THEN
      RAISE EXCEPTION 'Packet stock of "%" changed since the page loaded (now %). Refresh and try again. Nothing was changed.',
        v_row.name, v_row.stock;
    END IF;
    v_items := v_items || jsonb_build_object('productId', v_row.id, 'productName', v_row.name,
                                             'unit', v_row.unit, 'size', v_row.size, 'prevStock', v_row.stock);
    v_ids   := v_ids || v_row.id;
    v_units := v_units + v_row.stock;
    v_kg    := v_kg + v_row.stock * COALESCE(v_row.size, 0);
  END LOOP;

  IF array_length(v_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'All packet products are already at zero. Nothing was changed.';
  END IF;

  -- Permanent record first: every product and its stock before
  INSERT INTO factory_history (type, description, user_id, user_name, details)
  VALUES ('PACKET_STOCK_ZEROED',
          format('Set %s packet product(s) to zero (was %s units, %s kg in total). Short / excess kept as it was.',
                 array_length(v_ids, 1), round(v_units, 3)::float8, round(v_kg, 3)::float8),
          p_user_id, p_user_name,
          jsonb_build_object('items', v_items, 'kept', v_kept,
                             'products', array_length(v_ids, 1), 'totalUnits', v_units, 'totalKg', v_kg));

  UPDATE factory_packet_catalog
     SET stock = 0, updated_at = NOW()
   WHERE id = ANY (v_ids);

  RETURN jsonb_build_object('products', array_length(v_ids, 1), 'totalUnits', v_units, 'totalKg', v_kg, 'kept', v_kept);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_zero_packet_stock(JSONB, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_zero_packet_stock(JSONB, UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
