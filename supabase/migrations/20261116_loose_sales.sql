-- =============================================================================
-- Loose tea sold directly from a lot (without blending).
--
-- Stock only: billing stays in the separate billing ERP. A sale takes whole
-- bags out of a lot and is recorded with the buyer and that ERP's invoice
-- number, so the two can be matched.
--
-- Safe:
--   * Sell and undo each run in one transaction with the lot locked, so the
--     same bags can never be sold and blended at once.
--   * Sell only goes ahead if the lot's stock is still what the person saw.
--   * Sales are permanent records: they cannot be deleted or edited, only
--     cancelled once (undo), which puts the stock back.
--   * Every sale and every undo is written to History.
--   * Only the server can run these (not callable from the browser).
--
-- Adds a table and functions. Changes no existing data. Safe to run more than once.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.factory_loose_sales (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id            TEXT NOT NULL,          -- not a hard link: the lot may be purged later
  lot_number        TEXT NOT NULL,
  mark              TEXT,
  grade             TEXT,
  bags              INTEGER NOT NULL CHECK (bags > 0),
  weight            NUMERIC NOT NULL CHECK (weight > 0),
  weight_per_bag    NUMERIC,
  sale_date         DATE NOT NULL,
  buyer             TEXT,
  invoice_no        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID,
  created_by_name   TEXT,
  cancelled_at      TIMESTAMPTZ,
  cancelled_by      UUID,
  cancelled_by_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_factory_loose_sales_lot  ON public.factory_loose_sales (lot_id);
CREATE INDEX IF NOT EXISTS idx_factory_loose_sales_date ON public.factory_loose_sales (sale_date DESC, created_at DESC);

-- Server only: row security on, with no rules for the browser
ALTER TABLE public.factory_loose_sales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.factory_loose_sales FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.factory_loose_sales TO service_role;

-- Permanent record: no delete, no edits; the only change allowed is cancelling once
CREATE OR REPLACE FUNCTION public.fn__loose_sales_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Loose tea sales are permanent records and cannot be deleted. Use Undo to cancel a sale.';
  END IF;
  IF OLD.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'This sale was already cancelled and cannot be changed.';
  END IF;
  IF NEW.cancelled_at IS NULL
     OR (to_jsonb(NEW) - 'cancelled_at' - 'cancelled_by' - 'cancelled_by_name')
        IS DISTINCT FROM (to_jsonb(OLD) - 'cancelled_at' - 'cancelled_by' - 'cancelled_by_name') THEN
    RAISE EXCEPTION 'A loose tea sale cannot be edited. Use Undo to cancel it, then enter it again.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_factory_loose_sales_guard ON public.factory_loose_sales;
CREATE TRIGGER trg_factory_loose_sales_guard
  BEFORE UPDATE OR DELETE ON public.factory_loose_sales
  FOR EACH ROW EXECUTE FUNCTION public.fn__loose_sales_guard();

-- -----------------------------------------------------------------------------
-- Sell whole bags from a lot
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sell_loose_tea(
  p_lot_id          TEXT,
  p_bags            INTEGER,
  p_expected_bags   NUMERIC,   -- the lot's stock as shown on screen
  p_expected_weight NUMERIC,
  p_sale_date       DATE,
  p_buyer           TEXT,
  p_invoice_no      TEXT,
  p_user_id         UUID,
  p_user_name       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lot      factory_loose_lots%ROWTYPE;
  v_kg       NUMERIC;
  v_new_bags NUMERIC;
  v_new_kg   NUMERIC;
  v_sale_id  UUID;
  v_buyer    TEXT := NULLIF(btrim(COALESCE(p_buyer, '')), '');
  v_invoice  TEXT := NULLIF(btrim(COALESCE(p_invoice_no, '')), '');
BEGIN
  IF p_lot_id IN ('l-balance', 'l-orthodox', 'l-cardamom', 'l-cardamom-husk') OR p_lot_id LIKE 'l-%' THEN
    RAISE EXCEPTION 'System ledgers cannot be sold from here. Nothing was changed.';
  END IF;
  IF p_bags IS NULL OR p_bags <= 0 THEN
    RAISE EXCEPTION 'Enter how many bags were sold (1 or more). Nothing was changed.';
  END IF;
  IF p_sale_date IS NULL THEN
    RAISE EXCEPTION 'Enter the sale date. Nothing was changed.';
  END IF;

  SELECT * INTO v_lot FROM factory_loose_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lot not found. It may have been deleted. Nothing was changed.';
  END IF;

  -- Must still be what the person saw
  IF v_lot.bags IS DISTINCT FROM p_expected_bags OR v_lot.weight IS DISTINCT FROM p_expected_weight THEN
    RAISE EXCEPTION 'This lot''s stock changed since the page loaded (now % bags, % kg). Refresh and try again. Nothing was changed.',
      v_lot.bags, v_lot.weight;
  END IF;
  IF p_bags > v_lot.bags THEN
    RAISE EXCEPTION 'Only % bags are left in lot % (%). Nothing was changed.', v_lot.bags, v_lot.lot_number, v_lot.mark;
  END IF;

  -- Whole bags: bags x weight per bag. Selling the last bags takes whatever weight is left.
  IF p_bags = v_lot.bags THEN
    v_kg := v_lot.weight;
  ELSE
    v_kg := LEAST(round(p_bags * COALESCE(v_lot.weight_per_bag, 0), 3), v_lot.weight);
  END IF;
  IF v_kg IS NULL OR v_kg <= 0 THEN
    RAISE EXCEPTION 'This lot has no weight to sell (check its weight per bag). Nothing was changed.';
  END IF;

  v_new_bags := v_lot.bags - p_bags;
  v_new_kg   := round(v_lot.weight - v_kg, 3);

  UPDATE factory_loose_lots
     SET bags = v_new_bags, weight = v_new_kg, updated_at = NOW()
   WHERE id = p_lot_id;

  INSERT INTO factory_loose_sales (lot_id, lot_number, mark, grade, bags, weight, weight_per_bag,
                                   sale_date, buyer, invoice_no, created_by, created_by_name)
  VALUES (p_lot_id, v_lot.lot_number, v_lot.mark, v_lot.grade, p_bags, v_kg, v_lot.weight_per_bag,
          p_sale_date, v_buyer, v_invoice, p_user_id, p_user_name)
  RETURNING id INTO v_sale_id;

  INSERT INTO factory_history (type, description, user_id, user_name, details)
  VALUES ('LOOSE_SOLD',
          format('Sold %s bag(s) / %s kg of lot %s (%s)%s%s. Lot now %s bags / %s kg.',
                 p_bags, v_kg::float8, v_lot.lot_number, v_lot.mark,
                 CASE WHEN v_buyer   IS NOT NULL THEN ' to ' || v_buyer ELSE '' END,
                 CASE WHEN v_invoice IS NOT NULL THEN ', invoice ' || v_invoice ELSE '' END,
                 v_new_bags::float8, v_new_kg::float8),
          p_user_id, p_user_name,
          jsonb_build_object('saleId', v_sale_id, 'lotId', p_lot_id, 'lotNumber', v_lot.lot_number, 'mark', v_lot.mark,
                             'grade', v_lot.grade, 'bags', p_bags, 'weight', v_kg, 'saleDate', p_sale_date,
                             'buyer', v_buyer, 'invoiceNo', v_invoice,
                             'before', jsonb_build_object('bags', v_lot.bags, 'weight', v_lot.weight),
                             'after',  jsonb_build_object('bags', v_new_bags, 'weight', v_new_kg)));

  RETURN jsonb_build_object('saleId', v_sale_id, 'bags', p_bags, 'weight', v_kg,
                            'lotBags', v_new_bags, 'lotWeight', v_new_kg);
END;
$$;

-- -----------------------------------------------------------------------------
-- Undo a sale: puts the bags and kg back into the lot
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cancel_loose_sale(
  p_sale_id   UUID,
  p_user_id   UUID,
  p_user_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale     factory_loose_sales%ROWTYPE;
  v_lot      factory_loose_lots%ROWTYPE;
  v_new_bags NUMERIC;
  v_new_kg   NUMERIC;
BEGIN
  SELECT * INTO v_sale FROM factory_loose_sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found. Nothing was changed.';
  END IF;
  IF v_sale.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'This sale was already cancelled%. Nothing was changed.',
      CASE WHEN v_sale.cancelled_by_name IS NOT NULL THEN ' by ' || v_sale.cancelled_by_name ELSE '' END;
  END IF;

  SELECT * INTO v_lot FROM factory_loose_lots WHERE id = v_sale.lot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lot % (%) no longer exists (it was deleted after the sale), so the stock cannot be put back. Receive it as a new lot instead. Nothing was changed.',
      v_sale.lot_number, v_sale.mark;
  END IF;

  v_new_bags := v_lot.bags + v_sale.bags;
  v_new_kg   := round(v_lot.weight + v_sale.weight, 3);

  UPDATE factory_loose_lots
     SET bags = v_new_bags, weight = v_new_kg, updated_at = NOW()
   WHERE id = v_lot.id;

  UPDATE factory_loose_sales
     SET cancelled_at = NOW(), cancelled_by = p_user_id, cancelled_by_name = p_user_name
   WHERE id = p_sale_id;

  INSERT INTO factory_history (type, description, user_id, user_name, details)
  VALUES ('LOOSE_SALE_CANCELLED',
          format('Cancelled the sale of %s bag(s) / %s kg of lot %s (%s)%s. Stock put back: lot now %s bags / %s kg.',
                 v_sale.bags, v_sale.weight::float8, v_lot.lot_number, v_lot.mark,
                 CASE WHEN v_sale.invoice_no IS NOT NULL THEN ', invoice ' || v_sale.invoice_no ELSE '' END,
                 v_new_bags::float8, v_new_kg::float8),
          p_user_id, p_user_name,
          jsonb_build_object('saleId', p_sale_id, 'lotId', v_lot.id, 'lotNumber', v_lot.lot_number, 'mark', v_lot.mark,
                             'bags', v_sale.bags, 'weight', v_sale.weight, 'saleDate', v_sale.sale_date,
                             'buyer', v_sale.buyer, 'invoiceNo', v_sale.invoice_no,
                             'before', jsonb_build_object('bags', v_lot.bags, 'weight', v_lot.weight),
                             'after',  jsonb_build_object('bags', v_new_bags, 'weight', v_new_kg)));

  RETURN jsonb_build_object('saleId', p_sale_id, 'bags', v_sale.bags, 'weight', v_sale.weight,
                            'lotBags', v_new_bags, 'lotWeight', v_new_kg);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_sell_loose_tea(TEXT, INTEGER, NUMERIC, NUMERIC, DATE, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_sell_loose_tea(TEXT, INTEGER, NUMERIC, NUMERIC, DATE, TEXT, TEXT, UUID, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_cancel_loose_sale(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_cancel_loose_sale(UUID, UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.fn__loose_sales_guard() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
