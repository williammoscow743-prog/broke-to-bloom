ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS merchant text,
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'one-time',
  ADD COLUMN IF NOT EXISTS reminder_days integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'upcoming',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS bills_user_due_idx ON public.bills (user_id, due_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bills TO authenticated;
GRANT ALL ON public.bills TO service_role;

UPDATE public.bills SET status = 'paid' WHERE paid = true AND status <> 'paid';