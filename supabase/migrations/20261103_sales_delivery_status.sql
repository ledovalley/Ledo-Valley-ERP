-- =============================================================================
-- Migration: 20261103_sales_delivery_status.sql
-- Adds delivery_status and delivery timestamp columns to sales_records
-- =============================================================================

ALTER TABLE public.sales_records
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'delivered'
  CHECK (delivery_status IN ('pending', 'delivered', 'cancelled'));

ALTER TABLE public.sales_records
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sales_records_delivery_status
  ON public.sales_records(delivery_status);

CREATE INDEX IF NOT EXISTS idx_sales_records_payment_status
  ON public.sales_records(payment_status);
