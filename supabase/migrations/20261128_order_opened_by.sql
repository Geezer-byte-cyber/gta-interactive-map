-- Record the staff username (or owner display name) that opened each ticket.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS opened_by TEXT;

-- Existing tickets predate this field; label them clearly rather than guessing.
UPDATE public.orders
SET opened_by = 'Unknown'
WHERE opened_by IS NULL;
