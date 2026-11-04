CREATE TABLE public.gl_accounts (
  code text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  system boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gl_accounts TO authenticated;
GRANT ALL ON public.gl_accounts TO service_role;
ALTER TABLE public.gl_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read accounts" ON public.gl_accounts FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

INSERT INTO public.gl_accounts(code,name,type,system) VALUES
('1000','Cash on hand','asset',true),('1010','Bank & mobile money','asset',true),('1100','Debtors (customers)','asset',true),('1200','Stock (inventory)','asset',true),
('2000','Creditors (suppliers)','liability',true),('2100','VAT payable','liability',true),
('3000','Owner''s capital','equity',true),('3100','Retained earnings','equity',true),('3200','Owner''s drawings','equity',true),
('4000','Sales','income',true),('4100','Sales discounts','income',true),('4200','Sales returns','income',true),('4300','Other income','income',true),
('5000','Cost of sales','expense',true),('5100','Stock losses & write-offs','expense',true),
('6000','Operating expenses','expense',true),('6100','Debts written off','expense',true);

CREATE OR REPLACE FUNCTION public.can_view_accounts(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_staff(_user_id) AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role IN ('admin','owner','manager','accountant'))
$$;

CREATE SEQUENCE public.journal_number_seq START 1001;
CREATE TABLE public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_number text NOT NULL UNIQUE DEFAULT ('JV-' || nextval('public.journal_number_seq')),
  entry_date date NOT NULL,
  memo text NOT NULL,
  posted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_code text NOT NULL REFERENCES public.gl_accounts(code),
  debit numeric NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric NOT NULL DEFAULT 0 CHECK (credit >= 0)
);
GRANT SELECT ON public.journal_entries, public.journal_lines TO authenticated;
GRANT ALL ON public.journal_entries, public.journal_lines TO service_role;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accountants read journals" ON public.journal_entries FOR SELECT TO authenticated USING (public.can_view_accounts(auth.uid()));
CREATE POLICY "accountants read journal lines" ON public.journal_lines FOR SELECT TO authenticated USING (public.can_view_accounts(auth.uid()));

CREATE OR REPLACE FUNCTION public.save_gl_account(p_code text, p_name text, p_type text, p_active boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.can_view_accounts(auth.uid()) THEN RAISE EXCEPTION 'Only the Owner, Manager or Accountant can change accounts'; END IF;
  IF coalesce(trim(p_code),'')='' OR coalesce(trim(p_name),'')='' THEN RAISE EXCEPTION 'Account code and name are required'; END IF;
  INSERT INTO public.gl_accounts(code,name,type,active) VALUES (trim(p_code),trim(p_name),p_type,coalesce(p_active,true))
  ON CONFLICT (code) DO UPDATE SET name=excluded.name, active=excluded.active,
    type = CASE WHEN gl_accounts.system THEN gl_accounts.type ELSE excluded.type END;
END $$;

CREATE OR REPLACE FUNCTION public.post_journal(p_date date, p_memo text, p_lines jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_no text; v_dr numeric; v_cr numeric; l jsonb;
BEGIN
  IF NOT public.can_view_accounts(auth.uid()) THEN RAISE EXCEPTION 'Only the Owner, Manager or Accountant can post journals'; END IF;
  IF coalesce(trim(p_memo),'')='' THEN RAISE EXCEPTION 'Give the journal a description'; END IF;
  IF p_date > current_date THEN RAISE EXCEPTION 'Journal date cannot be in the future'; END IF;
  SELECT coalesce(sum((x->>'debit')::numeric),0), coalesce(sum((x->>'credit')::numeric),0) INTO v_dr, v_cr FROM jsonb_array_elements(p_lines) x;
  IF jsonb_array_length(p_lines) < 2 THEN RAISE EXCEPTION 'A journal needs at least two lines'; END IF;
  IF v_dr <= 0 OR round(v_dr,2) <> round(v_cr,2) THEN RAISE EXCEPTION 'Debits (%) must equal credits (%)', round(v_dr,2), round(v_cr,2); END IF;
  INSERT INTO public.journal_entries(entry_date,memo,posted_by) VALUES (p_date,trim(p_memo),auth.uid()) RETURNING id, journal_number INTO v_id, v_no;
  FOR l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.gl_accounts WHERE code=l->>'account' AND active) THEN RAISE EXCEPTION 'Unknown account %', l->>'account'; END IF;
    IF coalesce((l->>'debit')::numeric,0) > 0 AND coalesce((l->>'credit')::numeric,0) > 0 THEN RAISE EXCEPTION 'A line can be a debit or a credit, not both'; END IF;
    INSERT INTO public.journal_lines(entry_id,account_code,debit,credit) VALUES (v_id, l->>'account', round(coalesce((l->>'debit')::numeric,0),2), round(coalesce((l->>'credit')::numeric,0),2));
  END LOOP;
  RETURN v_no;
END $$;

CREATE OR REPLACE FUNCTION public.gl_method_account(p text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE WHEN public.is_account_method(p) THEN '1100' WHEN public.is_cash_method(p) THEN '1000' ELSE '1010' END
$$;

-- Every ledger line is derived from the shop's own records (sales, GRNs, expenses...) plus manual journals,
-- so the books can never drift from the till.
CREATE OR REPLACE FUNCTION public.gl_lines(p_to date)
RETURNS TABLE(entry_date date, source text, reference text, memo text, account_code text, debit numeric, credit numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.can_view_accounts(auth.uid()) THEN RAISE EXCEPTION 'Only the Owner, Manager or Accountant can view the books'; END IF;
  RETURN QUERY
  WITH s AS (SELECT * FROM public.sales WHERE created_at::date <= p_to),
  pay AS (
    SELECT sp.sale_id, sp.method, sum(CASE WHEN sp.currency='ZiG' THEN sp.amount/nullif(s.exchange_rate,0) ELSE sp.amount END) usd
    FROM public.sale_payments sp JOIN s ON s.id=sp.sale_id GROUP BY sp.sale_id, sp.method
  ),
  noncash AS (SELECT p.sale_id, sum(p.usd) usd FROM pay p WHERE public.gl_method_account(p.method) <> '1000' GROUP BY p.sale_id),
  lines AS (
    -- sale revenue & discount
    SELECT s.created_at::date d, 'sale' src, s.sale_number ref, 'Till sale' m, '4000' acc, 0::numeric dr, s.subtotal cr FROM s
    UNION ALL SELECT s.created_at::date, 'sale', s.sale_number, 'Till sale', '4100', s.discount, 0 FROM s WHERE s.discount <> 0
    UNION ALL SELECT s.created_at::date, 'sale', s.sale_number, 'Till sale', public.gl_method_account(p.method), round(p.usd,2), 0
      FROM pay p JOIN s ON s.id=p.sale_id WHERE public.gl_method_account(p.method) <> '1000'
    UNION ALL SELECT s.created_at::date, 'sale', s.sale_number, 'Till sale', '1000', s.total - coalesce(round(n.usd,2),0), 0
      FROM s LEFT JOIN noncash n ON n.sale_id=s.id WHERE s.total - coalesce(round(n.usd,2),0) <> 0
    -- cost of sales
    UNION ALL SELECT s.created_at::date, 'sale', s.sale_number, 'Cost of goods sold', '5000', c.cost, 0
      FROM s JOIN (SELECT sale_id, round(sum(quantity*cost_price),2) cost FROM public.sale_items GROUP BY sale_id) c ON c.sale_id=s.id WHERE c.cost<>0
    UNION ALL SELECT s.created_at::date, 'sale', s.sale_number, 'Cost of goods sold', '1200', 0, c.cost
      FROM s JOIN (SELECT sale_id, round(sum(quantity*cost_price),2) cost FROM public.sale_items GROUP BY sale_id) c ON c.sale_id=s.id WHERE c.cost<>0
    -- refunds
    UNION ALL SELECT r.created_at::date, 'refund', s2.sale_number, 'Refund: '||r.reason, '4200', r.amount, 0 FROM public.refunds r JOIN public.sales s2 ON s2.id=r.sale_id WHERE r.created_at::date<=p_to
    UNION ALL SELECT r.created_at::date, 'refund', s2.sale_number, 'Refund: '||r.reason, public.gl_method_account(r.method), 0, r.amount FROM public.refunds r JOIN public.sales s2 ON s2.id=r.sale_id WHERE r.created_at::date<=p_to
    -- goods returned by customers go back into stock (dated at the first refund)
    UNION ALL SELECT f.d, 'refund', s3.sale_number, 'Returned stock', '1200', c.cost, 0
      FROM (SELECT sale_id, min(created_at)::date d FROM public.refunds GROUP BY sale_id) f JOIN public.sales s3 ON s3.id=f.sale_id
      JOIN (SELECT sale_id, round(sum(refunded_qty*cost_price),2) cost FROM public.sale_items GROUP BY sale_id) c ON c.sale_id=f.sale_id WHERE f.d<=p_to AND c.cost<>0
    UNION ALL SELECT f.d, 'refund', s3.sale_number, 'Returned stock', '5000', 0, c.cost
      FROM (SELECT sale_id, min(created_at)::date d FROM public.refunds GROUP BY sale_id) f JOIN public.sales s3 ON s3.id=f.sale_id
      JOIN (SELECT sale_id, round(sum(refunded_qty*cost_price),2) cost FROM public.sale_items GROUP BY sale_id) c ON c.sale_id=f.sale_id WHERE f.d<=p_to AND c.cost<>0
    -- goods received
    UNION ALL SELECT g.created_at::date, 'grn', g.grn_number, 'Goods received', '1200', g.total, 0 FROM public.grns g WHERE g.created_at::date<=p_to
    UNION ALL SELECT g.created_at::date, 'grn', g.grn_number, 'Goods received', '2000', 0, g.total FROM public.grns g WHERE g.created_at::date<=p_to
    -- supplier payments & returns
    UNION ALL SELECT x.created_at::date, 'supplier_payment', coalesce(x.reference,'Supplier payment'), 'Paid supplier', '2000', x.amount, 0 FROM public.supplier_payments x WHERE x.created_at::date<=p_to
    UNION ALL SELECT x.created_at::date, 'supplier_payment', coalesce(x.reference,'Supplier payment'), 'Paid supplier', public.gl_method_account(x.method), 0, x.amount FROM public.supplier_payments x WHERE x.created_at::date<=p_to
    UNION ALL SELECT x.created_at::date, 'supplier_return', x.return_number, 'Returned to supplier', '2000', x.total, 0 FROM public.supplier_returns x WHERE x.created_at::date<=p_to
    UNION ALL SELECT x.created_at::date, 'supplier_return', x.return_number, 'Returned to supplier', '1200', 0, x.total FROM public.supplier_returns x WHERE x.created_at::date<=p_to
    -- expenses
    UNION ALL SELECT e.expense_date, 'expense', coalesce(e.reference, e.category), e.category, '6000', e.amount, 0 FROM public.expenses e WHERE e.expense_date<=p_to
    UNION ALL SELECT e.expense_date, 'expense', coalesce(e.reference, e.category), e.category, public.gl_method_account(e.method), 0, e.amount FROM public.expenses e WHERE e.expense_date<=p_to
    -- customer payments & balance adjustments
    UNION ALL SELECT c.created_at::date, 'customer_payment', c.payment_number, 'Customer paid', public.gl_method_account(c.method), c.amount, 0 FROM public.customer_payments c WHERE c.created_at::date<=p_to
    UNION ALL SELECT c.created_at::date, 'customer_payment', c.payment_number, 'Customer paid', '1100', 0, c.amount FROM public.customer_payments c WHERE c.created_at::date<=p_to
    UNION ALL SELECT a.created_at::date, 'customer_adjustment', 'ADJ', a.note, CASE WHEN a.kind='charge' THEN '1100' ELSE '6100' END, a.amount, 0 FROM public.customer_adjustments a WHERE a.created_at::date<=p_to
    UNION ALL SELECT a.created_at::date, 'customer_adjustment', 'ADJ', a.note, CASE WHEN a.kind='charge' THEN '4300' ELSE '1100' END, 0, a.amount FROM public.customer_adjustments a WHERE a.created_at::date<=p_to
    -- stock write-offs, adjustments, stocktake variances and opening stock
    UNION ALL SELECT sm.created_at::date, 'stock', coalesce(sm.reference, sm.type), sm.type,
        CASE WHEN sm.quantity < 0 THEN '5100' WHEN sm.type='opening' THEN '1200' ELSE '1200' END,
        CASE WHEN sm.quantity < 0 THEN round(-sm.quantity*p.cost_price,2) ELSE round(sm.quantity*p.cost_price,2) END, 0
      FROM public.stock_movements sm JOIN public.products p ON p.id=sm.product_id
      WHERE sm.type IN ('opening','adjustment','damaged','expired','stocktake') AND sm.created_at::date<=p_to AND sm.quantity<>0
    UNION ALL SELECT sm.created_at::date, 'stock', coalesce(sm.reference, sm.type), sm.type,
        CASE WHEN sm.quantity < 0 THEN '1200' WHEN sm.type='opening' THEN '3000' ELSE '5100' END,
        0, round(abs(sm.quantity)*p.cost_price,2)
      FROM public.stock_movements sm JOIN public.products p ON p.id=sm.product_id
      WHERE sm.type IN ('opening','adjustment','damaged','expired','stocktake') AND sm.created_at::date<=p_to AND sm.quantity<>0
    -- manual journals
    UNION ALL SELECT j.entry_date, 'journal', j.journal_number, j.memo, jl.account_code, jl.debit, jl.credit
      FROM public.journal_entries j JOIN public.journal_lines jl ON jl.entry_id=j.id WHERE j.entry_date<=p_to
  )
  SELECT l.d, l.src, l.ref, l.m, l.acc, round(l.dr,2), round(l.cr,2) FROM lines l WHERE l.dr<>0 OR l.cr<>0;
END $$;
REVOKE EXECUTE ON FUNCTION public.gl_lines(date) FROM anon;