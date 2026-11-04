CREATE TABLE public.customer_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('charge', 'credit')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  note TEXT NOT NULL DEFAULT '',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.customer_adjustments TO authenticated;
GRANT ALL ON public.customer_adjustments TO service_role;

ALTER TABLE public.customer_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read adjustments"
  ON public.customer_adjustments FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.can_adjust_customer_balance()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'owner', 'manager', 'accountant')
  )
$$;

CREATE OR REPLACE FUNCTION public.adjust_customer_balance(
  p_customer UUID,
  p_kind TEXT,
  p_amount NUMERIC,
  p_note TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.can_adjust_customer_balance() THEN
    RAISE EXCEPTION 'You do not have permission to adjust customer balances';
  END IF;
  IF p_kind NOT IN ('charge', 'credit') THEN
    RAISE EXCEPTION 'Adjustment must be a charge or a credit';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer) THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;
  INSERT INTO public.customer_adjustments (customer_id, kind, amount, note, created_by)
  VALUES (p_customer, p_kind, p_amount, COALESCE(p_note, ''), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;