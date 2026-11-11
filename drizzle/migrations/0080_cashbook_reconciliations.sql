CREATE TABLE public.cashbook_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL DEFAULT public.current_store_id() REFERENCES public.stores(id),
  account_code text NOT NULL,
  statement_date date NOT NULL,
  statement_balance numeric NOT NULL DEFAULT 0,
  cashbook_balance numeric NOT NULL DEFAULT 0,
  difference numeric NOT NULL DEFAULT 0,
  cleared jsonb NOT NULL DEFAULT '[]'::jsonb,
  reconciled_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, account_code, statement_date)
);
GRANT SELECT, INSERT, UPDATE ON public.cashbook_reconciliations TO authenticated;
GRANT ALL ON public.cashbook_reconciliations TO service_role;
ALTER TABLE public.cashbook_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY store_boundary ON public.cashbook_reconciliations AS RESTRICTIVE FOR ALL TO authenticated USING (store_id = public.current_store_id()) WITH CHECK (store_id = public.current_store_id());
CREATE POLICY accountants_read ON public.cashbook_reconciliations FOR SELECT TO authenticated USING (public.can_view_accounts(auth.uid()));
CREATE POLICY accountants_insert ON public.cashbook_reconciliations FOR INSERT TO authenticated WITH CHECK (public.can_view_accounts(auth.uid()) AND reconciled_by = auth.uid());
CREATE POLICY accountants_update ON public.cashbook_reconciliations FOR UPDATE TO authenticated USING (public.can_view_accounts(auth.uid())) WITH CHECK (public.can_view_accounts(auth.uid()) AND reconciled_by = auth.uid());