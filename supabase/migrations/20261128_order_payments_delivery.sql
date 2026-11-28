-- The Knox Map: order totals, payment tracking and delivered status
-- Safe to run more than once.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS amount_due NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (amount_due >= 0),
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'awaiting_payment';

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('New', 'In Progress', 'Waiting', 'Completed', 'Delivered', 'Cancelled'));

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('awaiting_payment', 'paid'));
