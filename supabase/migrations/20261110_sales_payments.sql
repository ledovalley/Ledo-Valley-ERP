-- =============================================================================
-- Recording a payment on an existing order, safely ("Collect" button)
--
-- Fixes, found in testing collectSalePayment:
--   1. The money never reached the salesperson's shift (the shift update was
--      refused because of a negative amount, and the error was ignored).
--   2. Any amount was accepted, e.g. Rs 5,000 on a Rs 500 order.
--   3. Two payments at the same moment overwrote each other (one was lost).
--   4. An order already paid in full could be paid again.
--
-- Now one database step locks the order, checks the amount against what is
-- due, updates the order, adds the money to the collector's running shift, and
-- keeps a record of every payment (sales_payments: when, how much, who, shift).
--
-- No existing data is changed. Safe to run more than once.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.sales_payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id          TEXT NOT NULL,
  cash_amount      NUMERIC NOT NULL DEFAULT 0 CHECK (cash_amount >= 0),
  online_amount    NUMERIC NOT NULL DEFAULT 0 CHECK (online_amount >= 0),
  due_before       NUMERIC,
  due_after        NUMERIC,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_by      UUID,
  received_by_name TEXT,
  shift_id         TEXT
);
CREATE INDEX IF NOT EXISTS idx_sales_payments_sale ON public.sales_payments (sale_id, received_at);
ALTER TABLE public.sales_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.sales_payments TO service_role;

CREATE OR REPLACE FUNCTION public.fn_record_sale_payment(
  p_sale_id       TEXT,
  p_cash          NUMERIC,
  p_online        NUMERIC,
  p_user_id       UUID,
  p_user_name     TEXT,
  p_is_management BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale     RECORD;
  v_cash     NUMERIC := round(COALESCE(p_cash, 0), 2);
  v_online   NUMERIC := round(COALESCE(p_online, 0), 2);
  v_due      NUMERIC;
  v_new_due  NUMERIC;
  v_shift_id TEXT;
BEGIN
  IF v_cash < 0 OR v_online < 0 THEN
    RAISE EXCEPTION 'Amounts cannot be negative.';
  END IF;
  IF v_cash + v_online <= 0 THEN
    RAISE EXCEPTION 'Enter the cash and/or online amount received.';
  END IF;

  -- Lock the order so two people can't record the same payment at once
  SELECT * INTO v_sale FROM sales_records WHERE id::text = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;
  IF NOT p_is_management AND v_sale.sales_person_id::text IS DISTINCT FROM p_user_id::text THEN
    RAISE EXCEPTION 'You can only record payments for your own orders.';
  END IF;

  v_due := round(COALESCE(v_sale.due_amount,
                          COALESCE(v_sale.amount, 0) - COALESCE(v_sale.cash_amount, 0) - COALESCE(v_sale.online_amount, 0)), 2);
  IF v_due <= 0 THEN
    RAISE EXCEPTION 'This order has nothing due.';
  END IF;
  IF v_cash + v_online > v_due THEN
    RAISE EXCEPTION 'Rs % received is more than the Rs % due on this order.', v_cash + v_online, v_due;
  END IF;

  v_new_due := v_due - v_cash - v_online;

  UPDATE sales_records
     SET cash_amount    = COALESCE(cash_amount, 0) + v_cash,
         online_amount  = COALESCE(online_amount, 0) + v_online,
         due_amount     = v_new_due,
         payment_status = CASE WHEN v_new_due = 0 THEN 'paid' ELSE 'partial' END
   WHERE id::text = p_sale_id;

  -- Add to the collector's own shift that is running now, if any
  UPDATE shifts
     SET cash_collected   = COALESCE(cash_collected, 0) + v_cash,
         online_collected = COALESCE(online_collected, 0) + v_online
   WHERE id = (SELECT s.id FROM shifts s
                WHERE s.user_id::text = p_user_id::text AND s.status IN ('active', 'paused')
                ORDER BY s.created_at DESC NULLS LAST LIMIT 1)
  RETURNING id::text INTO v_shift_id;

  INSERT INTO sales_payments (sale_id, cash_amount, online_amount, due_before, due_after,
                              received_by, received_by_name, shift_id)
  VALUES (p_sale_id, v_cash, v_online, v_due, v_new_due, p_user_id, p_user_name, v_shift_id);

  RETURN jsonb_build_object('success', true, 'dueBefore', v_due, 'dueAfter', v_new_due,
                            'addedToShift', v_shift_id IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_record_sale_payment(TEXT, NUMERIC, NUMERIC, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_record_sale_payment(TEXT, NUMERIC, NUMERIC, UUID, TEXT, BOOLEAN) TO service_role;

-- Finding orders with money due quickly
CREATE INDEX IF NOT EXISTS idx_sales_records_due
  ON public.sales_records (sales_person_id, created_at) WHERE due_amount > 0;
