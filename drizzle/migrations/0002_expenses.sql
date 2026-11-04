CREATE OR REPLACE FUNCTION public.can_post_expense(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','owner','manager','accountant'))
$$;

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date date NOT NULL DEFAULT current_date,
  category text NOT NULL,
  description text,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD',
  original_amount numeric NOT NULL,
  exchange_rate numeric NOT NULL DEFAULT 1,
  method text NOT NULL DEFAULT 'cash',
  reference text,
  posted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expense posters read expenses" ON public.expenses FOR SELECT TO authenticated USING (public.can_post_expense(auth.uid()));
CREATE POLICY "owners delete expenses" ON public.expenses FOR DELETE TO authenticated USING (public.is_owner_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.post_expense(p_date date, p_category text, p_description text, p_amount numeric, p_currency text, p_method text, p_reference text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rate numeric := 1; v_id uuid;
BEGIN
  IF NOT public.can_post_expense(auth.uid()) THEN RAISE EXCEPTION 'You are not allowed to post expenses'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be more than zero'; END IF;
  IF coalesce(trim(p_category),'') = '' THEN RAISE EXCEPTION 'Choose a category'; END IF;
  IF p_currency = 'ZiG' THEN SELECT zig_rate INTO v_rate FROM public.settings WHERE id = 1;
  ELSIF p_currency <> 'USD' THEN RAISE EXCEPTION 'Unknown currency'; END IF;
  INSERT INTO public.expenses(expense_date, category, description, amount, currency, original_amount, exchange_rate, method, reference, posted_by)
  VALUES (coalesce(p_date, current_date), trim(p_category), nullif(trim(p_description),''), round(p_amount / v_rate, 2), p_currency, p_amount, v_rate, p_method, nullif(trim(p_reference),''), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.post_expense(date, text, text, numeric, text, text, text) TO authenticated;