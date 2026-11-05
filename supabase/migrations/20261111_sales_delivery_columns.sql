-- =============================================================================
-- Delivery columns on sales orders (fixes: "Could not find the 'delivered_at'
-- column of 'sales_records' in the schema cache" when logging an order)
--
-- The app saves delivery_status and delivered_at with every new order. If either
-- column is missing in the database, no order can be saved. This adds whatever is
-- missing and tells Supabase to pick it up straight away.
--
-- No order is changed; orders logged before this count as delivered.
-- Safe to run more than once (also fine if 20261103_sales_delivery_status.sql ran).
-- =============================================================================

ALTER TABLE public.sales_records
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'delivered';
ALTER TABLE public.sales_records
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- The rule for delivery_status: added only if there is no rule for it yet
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.sales_records'::regclass AND contype = 'c'
                    AND pg_get_constraintdef(oid) ILIKE '%delivery_status%') THEN
    ALTER TABLE public.sales_records
      ADD CONSTRAINT sales_records_delivery_status_check
      CHECK (delivery_status IN ('pending', 'delivered', 'cancelled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_records_delivery_status ON public.sales_records (delivery_status);

-- Make the API see the new columns now
NOTIFY pgrst, 'reload schema';
