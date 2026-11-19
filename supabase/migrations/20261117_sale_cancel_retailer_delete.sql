-- =============================================================================
-- Admin: cancel a sale, and delete / hide a retailer.
--
-- CANCEL A SALE
--   * The order is taken out of sales_records and kept, complete, in
--     sales_cancelled (who cancelled it, when, why, and the full original
--     order). Because it is no longer in sales_records it drops out of every
--     total, due, target and report on its own.
--   * Cash collected on the order is taken off the sales person's shift:
--       - if they have a shift running now, off that shift straight away;
--       - if not, off their next shift, the moment it starts.
--   * If the order was made in the shift that is still running, that shift's
--     order count, order value, market due and online total are corrected too.
--     Shifts that have already ended keep the figures they closed with.
--   * Money paid online is only recorded (to be refunded by the office); it is
--     not taken off a later shift.
--
-- DELETE A RETAILER
--   * Unpaid dues: refused.
--   * No orders and no visits: deleted for good.
--   * Otherwise: hidden (not deleted), so past orders and reports keep the
--     name. An admin can restore it.
--
-- Everything runs in one transaction with rows locked. Only the server can run
-- these functions (not callable from the browser).
--
-- Adds a table, three columns on retailers (existing retailers stay as they
-- are) and functions. Changes no existing data. Safe to run more than once.
-- =============================================================================

-- ---------- cancelled orders (permanent record) ----------
CREATE TABLE IF NOT EXISTS public.sales_cancelled (
  id                     TEXT PRIMARY KEY,              -- the order's own id
  retailer_id            UUID,
  retailer_name          TEXT,
  shop_name              TEXT,
  sales_person_id        UUID,
  sale_created_at        TIMESTAMPTZ,
  amount                 NUMERIC NOT NULL DEFAULT 0,
  cash_amount            NUMERIC NOT NULL DEFAULT 0,
  online_amount          NUMERIC NOT NULL DEFAULT 0,
  due_amount             NUMERIC NOT NULL DEFAULT 0,
  order_qty              NUMERIC,
  original               JSONB NOT NULL,                -- the whole order row, as it was
  payments               JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason                 TEXT,
  cancelled_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_by           UUID,
  cancelled_by_name      TEXT,
  shift_corrected_id     TEXT,                          -- running shift whose order figures were corrected
  cash_refund            NUMERIC NOT NULL DEFAULT 0,    -- cash to come off the sales person's shift
  cash_refund_shift_id   TEXT,                          -- the shift it came off (empty = waiting for the next shift)
  cash_refund_applied_at TIMESTAMPTZ,
  online_refund          NUMERIC NOT NULL DEFAULT 0     -- paid online: recorded only
);

CREATE INDEX IF NOT EXISTS idx_sales_cancelled_at       ON public.sales_cancelled (cancelled_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_cancelled_retailer ON public.sales_cancelled (retailer_id);
CREATE INDEX IF NOT EXISTS idx_sales_cancelled_pending  ON public.sales_cancelled (sales_person_id)
  WHERE cash_refund > 0 AND cash_refund_applied_at IS NULL;

ALTER TABLE public.sales_cancelled ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_cancelled FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sales_cancelled TO service_role;

-- Permanent: no delete; the only change allowed is noting which shift the cash came off
CREATE OR REPLACE FUNCTION public.fn__sales_cancelled_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Cancelled orders are permanent records and cannot be deleted.';
  END IF;
  IF OLD.cash_refund_applied_at IS NOT NULL
     OR (to_jsonb(NEW) - 'cash_refund_shift_id' - 'cash_refund_applied_at')
        IS DISTINCT FROM (to_jsonb(OLD) - 'cash_refund_shift_id' - 'cash_refund_applied_at') THEN
    RAISE EXCEPTION 'A cancelled order cannot be changed.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_cancelled_guard ON public.sales_cancelled;
CREATE TRIGGER trg_sales_cancelled_guard
  BEFORE UPDATE OR DELETE ON public.sales_cancelled
  FOR EACH ROW EXECUTE FUNCTION public.fn__sales_cancelled_guard();

-- ---------- cancel a sale ----------
CREATE OR REPLACE FUNCTION public.fn_cancel_sale(
  p_sale_id   TEXT,
  p_reason    TEXT,
  p_user_id   UUID,
  p_user_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale        sales_records%ROWTYPE;
  v_ret         RECORD;
  v_shift       shifts%ROWTYPE;
  v_has_shift   BOOLEAN := FALSE;
  v_in_shift    BOOLEAN := FALSE;
  v_amount      NUMERIC;
  v_cash        NUMERIC;
  v_online      NUMERIC;
  v_due         NUMERIC;
  v_pay_cash    NUMERIC := 0;   -- collected later, through "Collect payment"
  v_pay_online  NUMERIC := 0;
  v_pay_online_here NUMERIC := 0; -- of that, online recorded on the running shift
  v_payments    JSONB := '[]'::jsonb;
  v_first_cash  NUMERIC;        -- taken when the order was made
  v_first_online NUMERIC;
  v_first_due   NUMERIC;
  v_online_off  NUMERIC := 0;
  v_shift_start TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_sale FROM sales_records WHERE id::text = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found. It may already have been cancelled. Nothing was changed.';
  END IF;

  v_amount := round(COALESCE(v_sale.amount, 0), 2);
  v_cash   := round(COALESCE(v_sale.cash_amount, 0), 2);
  v_online := round(COALESCE(v_sale.online_amount, 0), 2);
  v_due    := round(COALESCE(v_sale.due_amount, v_amount - v_cash - v_online), 2);

  SELECT name, shop_name INTO v_ret FROM retailers WHERE id = v_sale.retailer_id;

  -- Payments collected after the order was made (table from 20261110_sales_payments.sql)
  IF to_regclass('public.sales_payments') IS NOT NULL THEN
    SELECT COALESCE(sum(cash_amount), 0), COALESCE(sum(online_amount), 0), COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
      INTO v_pay_cash, v_pay_online, v_payments
      FROM sales_payments p WHERE p.sale_id = p_sale_id;
  END IF;
  v_first_cash   := GREATEST(v_cash - v_pay_cash, 0);
  v_first_online := GREATEST(v_online - v_pay_online, 0);
  v_first_due    := GREATEST(v_amount - v_first_cash - v_first_online, 0);

  -- The sales person's shift that is running now, if any
  SELECT * INTO v_shift FROM shifts s
   WHERE s.user_id::text = v_sale.sales_person_id::text AND s.status IN ('active', 'paused')
   ORDER BY s.created_at DESC NULLS LAST LIMIT 1
   FOR UPDATE;
  v_has_shift := FOUND;

  IF v_has_shift THEN
    v_shift_start := COALESCE((to_jsonb(v_shift)->>'start_time')::timestamptz, v_shift.created_at);
    v_in_shift := v_sale.created_at IS NOT NULL AND v_shift_start IS NOT NULL AND v_sale.created_at >= v_shift_start;

    IF to_regclass('public.sales_payments') IS NOT NULL THEN
      SELECT COALESCE(sum(online_amount), 0) INTO v_pay_online_here
        FROM sales_payments p WHERE p.sale_id = p_sale_id AND p.shift_id = v_shift.id::text;
    END IF;
    v_online_off := v_pay_online_here + CASE WHEN v_in_shift THEN v_first_online ELSE 0 END;

    UPDATE shifts
       SET cash_collected    = COALESCE(cash_collected, 0) - v_cash,
           online_collected  = GREATEST(COALESCE(online_collected, 0) - v_online_off, 0),
           orders_count      = CASE WHEN v_in_shift THEN GREATEST(COALESCE(orders_count, 0) - 1, 0) ELSE orders_count END,
           total_order_value = CASE WHEN v_in_shift THEN GREATEST(COALESCE(total_order_value, 0) - v_amount, 0) ELSE total_order_value END,
           market_due        = CASE WHEN v_in_shift THEN GREATEST(COALESCE(market_due, 0) - v_first_due, 0) ELSE market_due END
     WHERE id = v_shift.id;
  END IF;

  INSERT INTO sales_cancelled (id, retailer_id, retailer_name, shop_name, sales_person_id, sale_created_at,
                               amount, cash_amount, online_amount, due_amount, order_qty, original, payments,
                               reason, cancelled_by, cancelled_by_name,
                               shift_corrected_id, cash_refund, cash_refund_shift_id, cash_refund_applied_at, online_refund)
  VALUES (v_sale.id::text, v_sale.retailer_id, v_ret.name, v_ret.shop_name, v_sale.sales_person_id, v_sale.created_at,
          v_amount, v_cash, v_online, v_due, v_sale.order_qty, to_jsonb(v_sale), v_payments,
          NULLIF(btrim(COALESCE(p_reason, '')), ''), p_user_id, p_user_name,
          CASE WHEN v_has_shift AND v_in_shift THEN v_shift.id::text END,
          v_cash,
          CASE WHEN v_has_shift AND v_cash > 0 THEN v_shift.id::text END,
          CASE WHEN v_cash = 0 OR v_has_shift THEN NOW() END,
          v_online);

  DELETE FROM sales_records WHERE id::text = p_sale_id;

  RETURN jsonb_build_object(
    'amount', v_amount, 'cash', v_cash, 'online', v_online, 'due', v_due,
    'cashOffShiftNow', v_has_shift AND v_cash > 0,
    'cashOffNextShift', NOT v_has_shift AND v_cash > 0,
    'shiftCorrected', v_has_shift AND v_in_shift);
END;
$$;

-- ---------- cash from orders cancelled after the shift ended comes off the next shift ----------
CREATE OR REPLACE FUNCTION public.fn__shift_apply_cash_refunds()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total NUMERIC;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;
  BEGIN
    WITH due AS (
      SELECT id FROM sales_cancelled
       WHERE sales_person_id::text = NEW.user_id::text AND cash_refund > 0 AND cash_refund_applied_at IS NULL
       FOR UPDATE
    ), done AS (
      UPDATE sales_cancelled c
         SET cash_refund_shift_id = NEW.id::text, cash_refund_applied_at = NOW()
        FROM due WHERE c.id = due.id
      RETURNING c.cash_refund
    )
    SELECT COALESCE(sum(cash_refund), 0) INTO v_total FROM done;

    IF v_total > 0 THEN
      NEW.cash_collected := COALESCE(NEW.cash_collected, 0) - v_total;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Never stop a shift from starting: the refund stays waiting for the next one
    RAISE WARNING 'Cash refund adjustment skipped for this shift: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shift_apply_cash_refunds ON public.shifts;
CREATE TRIGGER trg_shift_apply_cash_refunds
  BEFORE INSERT ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.fn__shift_apply_cash_refunds();

-- ---------- retailers: delete or hide ----------
ALTER TABLE public.retailers ADD COLUMN IF NOT EXISTS is_active       BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.retailers ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ;
ALTER TABLE public.retailers ADD COLUMN IF NOT EXISTS deleted_by_name TEXT;

CREATE OR REPLACE FUNCTION public.fn_delete_retailer(
  p_retailer_id UUID,
  p_user_name   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ret     retailers%ROWTYPE;
  v_due     NUMERIC;
  v_due_n   INTEGER;
  v_orders  INTEGER;
  v_visits  INTEGER;
BEGIN
  SELECT * INTO v_ret FROM retailers WHERE id = p_retailer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Retailer not found. It may already have been deleted. Nothing was changed.';
  END IF;
  IF NOT v_ret.is_active THEN
    RAISE EXCEPTION 'This retailer is already removed. Nothing was changed.';
  END IF;

  SELECT COALESCE(sum(due_amount), 0), count(*) INTO v_due, v_due_n
    FROM sales_records WHERE retailer_id = p_retailer_id AND COALESCE(due_amount, 0) > 0;
  IF v_due > 0 THEN
    RAISE EXCEPTION '% still owes Rs % on % order(s). Collect the dues or cancel those orders first. Nothing was changed.',
      COALESCE(v_ret.shop_name, v_ret.name, 'This retailer'), v_due, v_due_n;
  END IF;

  SELECT (SELECT count(*) FROM sales_records   WHERE retailer_id = p_retailer_id)
       + (SELECT count(*) FROM sales_cancelled WHERE retailer_id = p_retailer_id) INTO v_orders;
  SELECT count(*) INTO v_visits FROM retailer_visits WHERE retailer_id = p_retailer_id;

  IF v_orders = 0 AND v_visits = 0 THEN
    DELETE FROM retailers WHERE id = p_retailer_id;
    RETURN jsonb_build_object('mode', 'deleted', 'orders', 0, 'visits', 0);
  END IF;

  UPDATE retailers
     SET is_active = FALSE, deleted_at = NOW(), deleted_by_name = p_user_name
   WHERE id = p_retailer_id;
  RETURN jsonb_build_object('mode', 'hidden', 'orders', v_orders, 'visits', v_visits);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_restore_retailer(p_retailer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE retailers SET is_active = TRUE, deleted_at = NULL, deleted_by_name = NULL
   WHERE id = p_retailer_id AND NOT is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Retailer not found among removed retailers. Nothing was changed.';
  END IF;
  RETURN jsonb_build_object('restored', TRUE);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_cancel_sale(TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_cancel_sale(TEXT, TEXT, UUID, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_delete_retailer(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_delete_retailer(UUID, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_restore_retailer(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_restore_retailer(UUID) TO service_role;
REVOKE ALL ON FUNCTION public.fn__sales_cancelled_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn__shift_apply_cash_refunds() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
