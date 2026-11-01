-- ==============================================================================
-- Migration: Factory Blending Security & ACID Hardening (Phase 1)
-- Date: 2026-10-31
-- Description:
--   Addresses vulnerabilities C3, C4, H3, H4, H5, H7 from code review:
--   1. Enable RLS on factory_packet_catalog and configure strict policies (C4).
--   2. Enforce explicit search_path and secure permissions on SECURITY DEFINER functions (C3).
--   3. Guard fn_create_factory_blend: validate numeric quantities (>0), bags string cast ('-'),
--      prevent negative weights (H4).
--   4. Guard fn_finalize_factory_blend: validate outputs, verify target products exist, ensure PENDING (H3, H4).
--   5. Guard fn_delete_factory_blend: restrict deletion to 'PENDING' blends only (H3).
--   6. Add atomic procedures fn_receive_packet_stock and fn_adjust_lot_weight (H5).
--   7. Add sequence-based blend serial counter factory_blend_serial_seq & serial_no column (H7).
-- ==============================================================================

-- 1. FIX C4: Enable RLS on factory_packet_catalog
ALTER TABLE IF EXISTS public.factory_packet_catalog ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'factory_packet_catalog' 
          AND policyname = 'Allow authenticated read factory_packet_catalog'
    ) THEN
        CREATE POLICY "Allow authenticated read factory_packet_catalog" 
            ON public.factory_packet_catalog 
            FOR SELECT 
            TO authenticated 
            USING (true);
    END IF;
END $$;

-- 2. FIX H7: Blend Serial Sequence & Column
-- Initialize sequence to highest existing SL number (defaults to 1 if none found)
DO $$
DECLARE
    v_max_serial INTEGER := 0;
BEGIN
    -- Add serial_no column to factory_blends if not present
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'factory_blends' 
          AND column_name = 'serial_no'
    ) THEN
        ALTER TABLE public.factory_blends ADD COLUMN serial_no INTEGER;
        CREATE INDEX IF NOT EXISTS idx_factory_blends_serial_no ON public.factory_blends(serial_no);
    END IF;

    -- Extract max numeric serial from blend_name (e.g. SL-554)
    SELECT COALESCE(MAX((substring(blend_name from 'SL-([0-9]+)'))::INTEGER), 0)
    INTO v_max_serial
    FROM public.factory_blends
    WHERE blend_name ~ 'SL-[0-9]+';

    -- Create or reset sequence to max + 1
    CREATE SEQUENCE IF NOT EXISTS public.factory_blend_serial_seq START WITH 1;
    IF v_max_serial > 0 THEN
        PERFORM setval('public.factory_blend_serial_seq', v_max_serial, true);
    END IF;
END $$;

-- Helper to safely obtain next blend serial
CREATE OR REPLACE FUNCTION public.fn_next_blend_serial()
RETURNS INTEGER
LANGUAGE sql
AS $$
    SELECT nextval('public.factory_blend_serial_seq')::INTEGER;
$$;

-- 3. FIX C3, H4: fn_create_factory_blend Hardened
CREATE OR REPLACE FUNCTION public.fn_create_factory_blend(
    p_blend_id TEXT,
    p_blend_name TEXT,
    p_batch_no TEXT,
    p_date DATE,
    p_total_quantity NUMERIC,
    p_created_by UUID,
    p_lots JSONB, -- Array of: [{"lotId": "...", "lotNumber": "...", "mark": "...", "grade": "...", "bagsUsed": 0, "weightUsed": 0}]
    p_history_id TEXT,
    p_user_name TEXT,
    p_serial_no INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_lot JSONB;
    v_lot_id TEXT;
    v_weight_used NUMERIC;
    v_bags_raw TEXT;
    v_bags_used NUMERIC;
    v_current_lot RECORD;
    v_calc_total NUMERIC := 0;
    v_assigned_serial INTEGER;
BEGIN
    -- Input validations (H4)
    IF p_blend_id IS NULL OR length(trim(p_blend_id)) = 0 THEN
        RAISE EXCEPTION 'Blend ID is required';
    END IF;

    IF p_total_quantity IS NULL OR p_total_quantity <= 0 THEN
        RAISE EXCEPTION 'Total blend quantity must be greater than 0';
    END IF;

    IF p_lots IS NULL OR jsonb_array_length(p_lots) = 0 THEN
        RAISE EXCEPTION 'At least one lot allocation is required for a blend';
    END IF;

    -- Assign sequence serial if not explicitly supplied
    IF p_serial_no IS NOT NULL AND p_serial_no > 0 THEN
        v_assigned_serial := p_serial_no;
    ELSE
        v_assigned_serial := nextval('public.factory_blend_serial_seq')::INTEGER;
    END IF;

    -- 1. Insert Blend Record with serial_no
    INSERT INTO public.factory_blends (
        id, blend_name, batch_no, date, total_quantity, status, created_by, serial_no
    )
    VALUES (
        p_blend_id, p_blend_name, p_batch_no, p_date, p_total_quantity, 'PENDING', p_created_by, v_assigned_serial
    );

    -- 2. Process Lots atomically with Row Locks
    FOR v_lot IN SELECT * FROM jsonb_array_elements(p_lots)
    LOOP
        v_lot_id := v_lot->>'lotId';

        IF v_lot_id IS NULL OR length(trim(v_lot_id)) = 0 THEN
            RAISE EXCEPTION 'Invalid lot entry: missing lotId';
        END IF;

        -- Safe numeric weight cast
        BEGIN
            v_weight_used := (v_lot->>'weightUsed')::NUMERIC;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Invalid weightUsed value for lot %: %', v_lot_id, v_lot->>'weightUsed';
        END;

        IF v_weight_used IS NULL OR v_weight_used <= 0 THEN
            RAISE EXCEPTION 'Weight used for lot % must be positive, got %', v_lot_id, v_weight_used;
        END IF;

        -- Safe bags cast (handles '-' string for system lots gracefully)
        v_bags_raw := trim(COALESCE(v_lot->>'bagsUsed', '0'));
        IF v_bags_raw = '' OR v_bags_raw = '-' OR v_bags_raw = 'N/A' THEN
            v_bags_used := 0;
        ELSE
            BEGIN
                v_bags_used := v_bags_raw::NUMERIC;
            EXCEPTION WHEN OTHERS THEN
                v_bags_used := 0;
            END;
        END IF;

        IF v_bags_used < 0 THEN
            RAISE EXCEPTION 'Bags used for lot % cannot be negative', v_lot_id;
        END IF;

        v_calc_total := v_calc_total + v_weight_used;

        -- Lock the lot row
        SELECT * INTO v_current_lot 
        FROM public.factory_loose_lots 
        WHERE id = v_lot_id 
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Lot % not found in inventory', v_lot_id;
        END IF;

        IF v_current_lot.weight < v_weight_used THEN
            RAISE EXCEPTION 'Insufficient weight for lot % (%). Available: % kg, Requested: % kg', 
                v_current_lot.lot_number, v_current_lot.mark, v_current_lot.weight, v_weight_used;
        END IF;

        -- Deduct stock atomically
        UPDATE public.factory_loose_lots
        SET 
            weight = GREATEST(0, weight - v_weight_used),
            bags = GREATEST(0, bags - v_bags_used),
            updated_at = NOW()
        WHERE id = v_lot_id;

        -- Insert lot usage record
        INSERT INTO public.factory_blend_lots_used (
            blend_id, lot_id, lot_number, mark, grade, bags_used, weight_used
        ) VALUES (
            p_blend_id,
            v_lot_id,
            COALESCE(v_lot->>'lotNumber', v_current_lot.lot_number),
            COALESCE(v_lot->>'mark', v_current_lot.mark),
            COALESCE(v_lot->>'grade', v_current_lot.grade),
            v_bags_used,
            v_weight_used
        );
    END LOOP;

    -- 3. Insert Audit Record in Factory History
    INSERT INTO public.factory_history (id, type, description, timestamp, user_id, user_name, details)
    VALUES (
        p_history_id,
        'BLEND_INITIATED',
        format('Initiated blend instruction: %s (%s) for %s kg.', p_blend_name, p_batch_no, p_total_quantity),
        NOW(),
        p_created_by,
        p_user_name,
        jsonb_build_object(
            'blendId', p_blend_id,
            'blendName', p_blend_name,
            'batchNo', p_batch_no,
            'serialNo', v_assigned_serial,
            'totalQuantity', p_total_quantity,
            'lots', p_lots
        )
    );

    RETURN jsonb_build_object('success', true, 'blendId', p_blend_id, 'serialNo', v_assigned_serial);
END;
$$;

-- 4. FIX C3, H3, H4: fn_finalize_factory_blend Hardened
CREATE OR REPLACE FUNCTION public.fn_finalize_factory_blend(
    p_blend_id TEXT,
    p_returned_loose NUMERIC,
    p_return_lot_id TEXT, -- Target lot ID for return, e.g. 'l-balance'
    p_outputs JSONB,      -- Produced packet items
    p_history_id TEXT,
    p_user_id UUID,
    p_user_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_blend RECORD;
    v_total_output NUMERIC := 0;
    v_out JSONB;
    v_prod_id TEXT;
    v_prod_qty NUMERIC;
    v_prod_weight NUMERIC;
    v_packet_record RECORD;
BEGIN
    -- Guard blend status (H3)
    SELECT * INTO v_blend 
    FROM public.factory_blends 
    WHERE id = p_blend_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Blend % not found', p_blend_id;
    END IF;

    IF v_blend.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Only PENDING blends can be finalized. Current status is %', v_blend.status;
    END IF;

    IF p_returned_loose < 0 THEN
        RAISE EXCEPTION 'Returned loose tea weight cannot be negative';
    END IF;

    IF p_outputs IS NULL OR jsonb_array_length(p_outputs) = 0 THEN
        RAISE EXCEPTION 'Finalization requires at least one output product specification';
    END IF;

    -- Process produced packaged tea items (H4: verify product exists & validate quantities)
    FOR v_out IN SELECT * FROM jsonb_array_elements(p_outputs)
    LOOP
        v_prod_id := v_out->>'productId';
        BEGIN
            v_prod_qty := (v_out->>'quantity')::NUMERIC;
            v_prod_weight := (v_out->>'totalWeight')::NUMERIC;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Invalid output quantity or totalWeight for product %', v_prod_id;
        END;

        IF v_prod_qty < 0 OR v_prod_weight < 0 THEN
            RAISE EXCEPTION 'Output product quantities cannot be negative';
        END IF;

        IF v_prod_id IS NOT NULL AND v_prod_qty > 0 THEN
            -- Check target product catalog exists
            SELECT * INTO v_packet_record 
            FROM public.factory_packet_catalog 
            WHERE id = v_prod_id 
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Target packet product catalog ID % does not exist', v_prod_id;
            END IF;

            UPDATE public.factory_packet_catalog
            SET stock = stock + v_prod_qty,
                updated_at = NOW()
            WHERE id = v_prod_id;
        END IF;

        v_total_output := v_total_output + COALESCE(v_prod_weight, 0);
    END LOOP;

    -- Credit returned loose tea back if applicable
    IF p_returned_loose > 0 THEN
        IF p_return_lot_id IS NULL OR length(trim(p_return_lot_id)) = 0 THEN
            RAISE EXCEPTION 'Target lot ID is required when returning loose tea';
        END IF;

        UPDATE public.factory_loose_lots
        SET weight = weight + p_returned_loose,
            updated_at = NOW()
        WHERE id = p_return_lot_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Return lot ID % not found in loose lots inventory', p_return_lot_id;
        END IF;
    END IF;

    -- Mark blend status PACKED
    UPDATE public.factory_blends
    SET status = 'PACKED',
        updated_at = NOW()
    WHERE id = p_blend_id;

    -- Insert Audit Record into Factory History
    INSERT INTO public.factory_history (id, type, description, timestamp, user_id, user_name, details)
    VALUES (
        p_history_id,
        'BLEND_PACKED',
        format('Finalized blend %s. Output: %s kg. Returned Loose: %s kg.', v_blend.blend_name, v_total_output, p_returned_loose),
        NOW(),
        p_user_id,
        p_user_name,
        jsonb_build_object(
            'blendId', p_blend_id,
            'blendName', v_blend.blend_name,
            'batchNo', v_blend.batch_no,
            'producedItems', p_outputs,
            'returnedLooseWeight', p_returned_loose,
            'totalOutputQuantity', v_total_output
        )
    );

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 5. FIX C3, H3: fn_delete_factory_blend Hardened
CREATE OR REPLACE FUNCTION public.fn_delete_factory_blend(
    p_blend_id TEXT,
    p_history_id TEXT,
    p_user_id UUID,
    p_user_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_blend RECORD;
    v_lot_used RECORD;
BEGIN
    SELECT * INTO v_blend 
    FROM public.factory_blends 
    WHERE id = p_blend_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Blend % not found', p_blend_id;
    END IF;

    -- Critical Guard (H3): NEVER allow deleting finalized or already packed blends
    IF v_blend.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Cannot delete blend with status %. Only PENDING under-process blends can be deleted and reverted.', v_blend.status;
    END IF;

    -- Revert inventory consumed by this pending blend
    FOR v_lot_used IN 
        SELECT * FROM public.factory_blend_lots_used 
        WHERE blend_id = p_blend_id
    LOOP
        IF v_lot_used.lot_id IS NOT NULL THEN
            UPDATE public.factory_loose_lots
            SET 
                weight = weight + v_lot_used.weight_used,
                bags = bags + COALESCE(v_lot_used.bags_used, 0),
                updated_at = NOW()
            WHERE id = v_lot_used.lot_id;
        END IF;
    END LOOP;

    -- Delete blend record (factory_blend_lots_used cascades)
    DELETE FROM public.factory_blends WHERE id = p_blend_id;

    -- Insert Audit Record into Factory History
    INSERT INTO public.factory_history (id, type, description, timestamp, user_id, user_name, details)
    VALUES (
        p_history_id,
        'BLEND_DELETED',
        format('Deleted blend %s and safely reverted stock.', v_blend.blend_name),
        NOW(),
        p_user_id,
        p_user_name,
        jsonb_build_object('blendId', p_blend_id, 'blendName', v_blend.blend_name, 'batchNo', v_blend.batch_no)
    );

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 6. FIX H5: Atomic Packet Stock Receiving
CREATE OR REPLACE FUNCTION public.fn_receive_packet_stock(
    p_product_id TEXT,
    p_quantity NUMERIC,
    p_date DATE,
    p_history_id TEXT,
    p_user_id UUID,
    p_user_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_product RECORD;
    v_new_stock NUMERIC;
BEGIN
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Received quantity must be greater than 0';
    END IF;

    -- Atomically lock and update product catalog
    SELECT * INTO v_product 
    FROM public.factory_packet_catalog 
    WHERE id = p_product_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % not found in packet catalog', p_product_id;
    END IF;

    v_new_stock := v_product.stock + p_quantity;

    UPDATE public.factory_packet_catalog
    SET stock = v_new_stock,
        updated_at = NOW()
    WHERE id = p_product_id;

    -- Record audit history
    INSERT INTO public.factory_history (id, type, description, timestamp, user_id, user_name, details)
    VALUES (
        p_history_id,
        'PACKET_STOCK_RECEIVED',
        format('Received %s %s(s) of "%s". New Stock: %s', p_quantity, v_product.unit, v_product.name, v_new_stock),
        NOW(),
        p_user_id,
        p_user_name,
        jsonb_build_object(
            'productId', p_product_id,
            'productName', v_product.name,
            'addedQuantity', p_quantity,
            'newStock', v_new_stock,
            'date', p_date
        )
    );

    RETURN jsonb_build_object('success', true, 'newStock', v_new_stock);
END;
$$;

-- 7. FIX H5: Atomic Loose Lot Weight / System Ledger Adjustment
CREATE OR REPLACE FUNCTION public.fn_adjust_lot_weight(
    p_target_id TEXT,
    p_amount NUMERIC,
    p_reason TEXT,
    p_history_id TEXT,
    p_user_id UUID,
    p_user_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_lot RECORD;
    v_new_weight NUMERIC;
BEGIN
    IF p_amount IS NULL OR p_amount = 0 THEN
        RAISE EXCEPTION 'Adjustment amount cannot be zero';
    END IF;

    SELECT * INTO v_lot 
    FROM public.factory_loose_lots 
    WHERE id = p_target_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lot % not found in factory loose lots', p_target_id;
    END IF;

    v_new_weight := v_lot.weight + p_amount;
    IF v_new_weight < 0 THEN
        RAISE EXCEPTION 'Adjustment would result in negative weight (% kg) for lot %', v_new_weight, v_lot.lot_number;
    END IF;

    UPDATE public.factory_loose_lots
    SET weight = v_new_weight,
        updated_at = NOW()
    WHERE id = p_target_id;

    INSERT INTO public.factory_history (id, type, description, timestamp, user_id, user_name, details)
    VALUES (
        p_history_id,
        'LEDGER_ADJUSTMENT',
        format('Adjusted %s by %s%s kg. Reason: %s', v_lot.mark, CASE WHEN p_amount > 0 THEN '+' ELSE '' END, p_amount, p_reason),
        NOW(),
        p_user_id,
        p_user_name,
        jsonb_build_object(
            'target_id', p_target_id,
            'mark', v_lot.mark,
            'prev_weight', v_lot.weight,
            'adjustment_amount', p_amount,
            'new_weight', v_new_weight,
            'reason', p_reason
        )
    );

    RETURN jsonb_build_object('success', true, 'newWeight', v_new_weight);
END;
$$;

-- 8. FIX C3: Restrict Execution Permissions on Security Definer Functions
-- Revoke default public execution
REVOKE EXECUTE ON FUNCTION public.fn_create_factory_blend(TEXT, TEXT, TEXT, DATE, NUMERIC, UUID, JSONB, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_finalize_factory_blend(TEXT, NUMERIC, TEXT, JSONB, TEXT, UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_delete_factory_blend(TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_receive_packet_stock(TEXT, NUMERIC, DATE, TEXT, UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_adjust_lot_weight(TEXT, NUMERIC, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon;

-- Grant execution to authenticated role (and postgres/service_role have admin access)
GRANT EXECUTE ON FUNCTION public.fn_create_factory_blend(TEXT, TEXT, TEXT, DATE, NUMERIC, UUID, JSONB, TEXT, TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_finalize_factory_blend(TEXT, NUMERIC, TEXT, JSONB, TEXT, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_delete_factory_blend(TEXT, TEXT, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_receive_packet_stock(TEXT, NUMERIC, DATE, TEXT, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_adjust_lot_weight(TEXT, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated, service_role;

