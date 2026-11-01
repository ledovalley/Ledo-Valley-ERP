-- ==============================================================================
-- Migration: Sales Shifts Concurrency & Atomic Increments (Phase 3)
-- Date: 2026-11-01
-- Description:
--   Addresses vulnerability H6:
--   Concurrent sales records updating shift metrics via read-modify-write causes
--   lost orders count, visits count, cash_collected, online_collected, and market_due.
--   Provides atomic procedures fn_record_sale_on_shift and fn_increment_shift_visits.
-- ==============================================================================

-- 1. Atomic Order & Payment Metrics Accumulation
CREATE OR REPLACE FUNCTION public.fn_record_sale_on_shift(
    p_shift_id UUID,
    p_order_value NUMERIC,
    p_cash_amount NUMERIC,
    p_online_amount NUMERIC,
    p_due_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_shift RECORD;
BEGIN
    IF p_shift_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'No shift ID provided');
    END IF;

    -- Lock shift row exclusively
    SELECT * INTO v_shift
    FROM public.shifts
    WHERE id = p_shift_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Shift not found');
    END IF;

    -- Only allow accumulating on active or paused shifts
    IF v_shift.status NOT IN ('active', 'paused') THEN
        RETURN jsonb_build_object('success', false, 'message', format('Cannot add sale to shift with status %s', v_shift.status));
    END IF;

    -- Perform atomic increments in PostgreSQL
    UPDATE public.shifts
    SET 
        orders_count = COALESCE(orders_count, 0) + 1,
        visits_count = COALESCE(visits_count, 0) + 1,
        total_order_value = COALESCE(total_order_value, 0) + COALESCE(p_order_value, 0),
        cash_collected = COALESCE(cash_collected, 0) + COALESCE(p_cash_amount, 0),
        online_collected = COALESCE(online_collected, 0) + COALESCE(p_online_amount, 0),
        market_due = COALESCE(market_due, 0) + COALESCE(p_due_amount, 0),
        updated_at = NOW()
    WHERE id = p_shift_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 2. Atomic Visit Count Increment
CREATE OR REPLACE FUNCTION public.fn_increment_shift_visits(
    p_shift_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_shift RECORD;
BEGIN
    IF p_shift_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'No shift ID provided');
    END IF;

    SELECT * INTO v_shift
    FROM public.shifts
    WHERE id = p_shift_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Shift not found');
    END IF;

    IF v_shift.status NOT IN ('active', 'paused') THEN
        RETURN jsonb_build_object('success', false, 'message', format('Cannot add visit to shift with status %s', v_shift.status));
    END IF;

    UPDATE public.shifts
    SET 
        visits_count = COALESCE(visits_count, 0) + 1,
        updated_at = NOW()
    WHERE id = p_shift_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Restrict permissions
REVOKE EXECUTE ON FUNCTION public.fn_record_sale_on_shift(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_increment_shift_visits(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_record_sale_on_shift(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_increment_shift_visits(UUID) TO authenticated, service_role;

