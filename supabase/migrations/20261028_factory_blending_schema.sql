-- Migration: Factory & Tea Blending Tables and ACID Stored Procedures

-- 1. Factory Loose Lots Table
CREATE TABLE IF NOT EXISTS public.factory_loose_lots (
    id TEXT PRIMARY KEY,
    lot_number TEXT NOT NULL,
    grade TEXT NOT NULL,
    mark TEXT NOT NULL,
    bags NUMERIC DEFAULT 0,
    weight_per_bag NUMERIC DEFAULT 0,
    weight NUMERIC NOT NULL DEFAULT 0,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    labels TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for searching and lot lookups
CREATE INDEX IF NOT EXISTS idx_factory_loose_lots_lot_number ON public.factory_loose_lots(lot_number);
CREATE INDEX IF NOT EXISTS idx_factory_loose_lots_mark ON public.factory_loose_lots(mark);

-- 2. Factory Blends Table
CREATE TABLE IF NOT EXISTS public.factory_blends (
    id TEXT PRIMARY KEY,
    blend_name TEXT NOT NULL,
    batch_no TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_quantity NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'PACKED', 'CANCELLED')) DEFAULT 'PENDING',
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_factory_blends_status ON public.factory_blends(status);
CREATE INDEX IF NOT EXISTS idx_factory_blends_date ON public.factory_blends(date);

-- 3. Factory Blend Lots Used
CREATE TABLE IF NOT EXISTS public.factory_blend_lots_used (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blend_id TEXT NOT NULL REFERENCES public.factory_blends(id) ON DELETE CASCADE,
    lot_id TEXT REFERENCES public.factory_loose_lots(id) ON DELETE SET NULL,
    lot_number TEXT NOT NULL,
    mark TEXT NOT NULL,
    grade TEXT,
    labels TEXT[] DEFAULT '{}',
    bags_used NUMERIC DEFAULT 0,
    weight_used NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_factory_blend_lots_blend_id ON public.factory_blend_lots_used(blend_id);

-- 4. Factory History Ledger (Immutable Audit Trail)
CREATE TABLE IF NOT EXISTS public.factory_history (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name TEXT,
    details JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_factory_history_timestamp ON public.factory_history(timestamp DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.factory_loose_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_blends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_blend_lots_used ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_history ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to access factory tables (managed via Server Actions and Service Role)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated read factory_loose_lots') THEN
        CREATE POLICY "Allow authenticated read factory_loose_lots" ON public.factory_loose_lots FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated read factory_blends') THEN
        CREATE POLICY "Allow authenticated read factory_blends" ON public.factory_blends FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated read factory_blend_lots_used') THEN
        CREATE POLICY "Allow authenticated read factory_blend_lots_used" ON public.factory_blend_lots_used FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated read factory_history') THEN
        CREATE POLICY "Allow authenticated read factory_history" ON public.factory_history FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

-- 5. ACID Stored Procedure: Create Blend Atomically
CREATE OR REPLACE FUNCTION public.fn_create_factory_blend(
    p_blend_id TEXT,
    p_blend_name TEXT,
    p_batch_no TEXT,
    p_date DATE,
    p_total_quantity NUMERIC,
    p_created_by UUID,
    p_lots JSONB, -- Array of objects: [{"lotId": "...", "lotNumber": "...", "mark": "...", "grade": "...", "bagsUsed": 0, "weightUsed": 0}]
    p_history_id TEXT,
    p_user_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_lot JSONB;
    v_lot_id TEXT;
    v_weight_used NUMERIC;
    v_bags_used NUMERIC;
    v_current_lot RECORD;
BEGIN
    -- 1. Insert Blend Record
    INSERT INTO public.factory_blends (id, blend_name, batch_no, date, total_quantity, status, created_by)
    VALUES (p_blend_id, p_blend_name, p_batch_no, p_date, p_total_quantity, 'PENDING', p_created_by);

    -- 2. Process Lots atomically with Row Locks
    FOR v_lot IN SELECT * FROM jsonb_array_elements(p_lots)
    LOOP
        v_lot_id := v_lot->>'lotId';
        v_weight_used := (v_lot->>'weightUsed')::NUMERIC;
        v_bags_used := COALESCE((v_lot->>'bagsUsed')::NUMERIC, 0);

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

        -- Deduct stock
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
            'totalQuantity', p_total_quantity,
            'lots', p_lots
        )
    );

    RETURN jsonb_build_object('success', true, 'blendId', p_blend_id);
END;
$$;

-- 6. ACID Stored Procedure: Finalize Blend Atomically
CREATE OR REPLACE FUNCTION public.fn_finalize_factory_blend(
    p_blend_id TEXT,
    p_returned_loose NUMERIC,
    p_return_lot_id TEXT, -- Target lot ID for return, e.g. 'l-balance'
    p_outputs JSONB, -- Produced packet items
    p_history_id TEXT,
    p_user_id UUID,
    p_user_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_blend RECORD;
    v_total_output NUMERIC := 0;
    v_out JSONB;
BEGIN
    SELECT * INTO v_blend 
    FROM public.factory_blends 
    WHERE id = p_blend_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Blend % not found', p_blend_id;
    END IF;

    IF v_blend.status = 'PACKED' THEN
        RAISE EXCEPTION 'Blend % has already been finalized', p_blend_id;
    END IF;

    -- Calculate total packaged output weight
    FOR v_out IN SELECT * FROM jsonb_array_elements(p_outputs)
    LOOP
        v_total_output := v_total_output + COALESCE((v_out->>'totalWeight')::NUMERIC, 0);
    END LOOP;

    -- Credit returned loose tea back if applicable
    IF p_returned_loose > 0 AND p_return_lot_id IS NOT NULL THEN
        UPDATE public.factory_loose_lots
        SET weight = weight + p_returned_loose,
            updated_at = NOW()
        WHERE id = p_return_lot_id;
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

-- 7. ACID Stored Procedure: Delete & Revert Blend Atomically
CREATE OR REPLACE FUNCTION public.fn_delete_factory_blend(
    p_blend_id TEXT,
    p_history_id TEXT,
    p_user_id UUID,
    p_user_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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

    -- Revert inventory consumed by this blend
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

    -- Delete or Mark Cancelled
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
        jsonb_build_object('blendId', p_blend_id, 'blendName', v_blend.blend_name)
    );

    RETURN jsonb_build_object('success', true);
END;
$$;

