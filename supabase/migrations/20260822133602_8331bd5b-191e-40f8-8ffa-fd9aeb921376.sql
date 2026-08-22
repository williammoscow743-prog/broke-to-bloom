CREATE TABLE public.upcoming_income (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  amount numeric NOT NULL,
  expected_date date NOT NULL,
  category text,
  source text,
  account_id uuid,
  recurrence text NOT NULL DEFAULT 'one-time',
  status text NOT NULL DEFAULT 'expected',
  notes text,
  received_at timestamp with time zone,
  entry_id uuid,
  archived_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.upcoming_income TO authenticated;
GRANT ALL ON public.upcoming_income TO service_role;

ALTER TABLE public.upcoming_income ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own upcoming income" ON public.upcoming_income FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_upcoming_income_updated_at BEFORE UPDATE ON public.upcoming_income FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_upcoming_income_user_date ON public.upcoming_income (user_id, expected_date);