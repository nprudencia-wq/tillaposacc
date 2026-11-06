ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS debtor_interest_rate numeric NOT NULL DEFAULT 5 CHECK (debtor_interest_rate >= 0),
  ADD COLUMN IF NOT EXISTS interest_after_days integer NOT NULL DEFAULT 30 CHECK (interest_after_days >= 0),
  ADD COLUMN IF NOT EXISTS bad_debt_provision_rate numeric NOT NULL DEFAULT 1 CHECK (bad_debt_provision_rate >= 0 AND bad_debt_provision_rate <= 100),
  ADD COLUMN IF NOT EXISTS provision_after_days integer NOT NULL DEFAULT 120 CHECK (provision_after_days >= 0);

ALTER TABLE public.customer_adjustments ADD COLUMN IF NOT EXISTS period text;
ALTER TABLE public.customer_adjustments DROP CONSTRAINT customer_adjustments_kind_check;
ALTER TABLE public.customer_adjustments ADD CONSTRAINT customer_adjustments_kind_check CHECK (kind IN ('charge','credit','interest'));
CREATE UNIQUE INDEX IF NOT EXISTS customer_interest_once_per_month ON public.customer_adjustments (customer_id, period) WHERE kind = 'interest';

INSERT INTO public.gl_accounts (store_id, code, name, type, system, active)
SELECT s.id, v.code, v.name, v.type, true, true FROM public.stores s
CROSS JOIN (VALUES ('1150','Allowance for doubtful debts','asset'),('4400','Interest income','income'),('6200','Bad debt provision','expense')) v(code,name,type)
ON CONFLICT DO NOTHING;

-- Per-customer debt older than p_days as at p_asof; payments clear oldest debt first. Interest is excluded (simple interest).
CREATE OR REPLACE FUNCTION public.debtor_overdue(p_asof date, p_days integer)
RETURNS TABLE(customer_id uuid, amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH sid AS (SELECT public.current_store_id() id),
  charges AS (
    SELECT s.customer_id cid, s.created_at d, p.amount/nullif(p.exchange_rate,0) amt
    FROM public.sale_payments p JOIN public.sales s ON s.id=p.sale_id, sid
    WHERE s.store_id=sid.id AND s.customer_id IS NOT NULL AND public.is_account_method(p.method) AND s.created_at::date<=p_asof
    UNION ALL
    SELECT a.customer_id, a.created_at, a.amount FROM public.customer_adjustments a, sid
    WHERE a.store_id=sid.id AND a.kind='charge' AND a.created_at::date<=p_asof
  ),
  credits AS (
    SELECT cid, sum(amt) total FROM (
      SELECT customer_id cid, amount amt FROM public.customer_payments, sid WHERE store_id=sid.id AND created_at::date<=p_asof
      UNION ALL SELECT s.customer_id, r.amount FROM public.refunds r JOIN public.sales s ON s.id=r.sale_id, sid
        WHERE r.store_id=sid.id AND public.is_account_method(r.method) AND r.created_at::date<=p_asof
      UNION ALL SELECT customer_id, amount FROM public.customer_adjustments, sid WHERE store_id=sid.id AND kind='credit' AND created_at::date<=p_asof
    ) x GROUP BY cid
  ),
  fifo AS (
    SELECT c.cid, c.d, c.amt, sum(c.amt) OVER (PARTITION BY c.cid ORDER BY c.d ROWS UNBOUNDED PRECEDING) cum, coalesce(cr.total,0) paid
    FROM charges c LEFT JOIN credits cr ON cr.cid=c.cid
  )
  SELECT cid, round(sum(greatest(0, least(amt, cum-paid))),2)
  FROM fifo WHERE d::date <= p_asof - p_days GROUP BY cid
  HAVING sum(greatest(0, least(amt, cum-paid))) > 0.004
$$;
REVOKE ALL ON FUNCTION public.debtor_overdue(date, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.debtor_overdue(date, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.raise_debtor_interest()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sid uuid := public.current_store_id(); v_rate numeric; v_days int; v_period text := to_char(current_date,'YYYY-MM'); n int := 0; r record;
BEGIN
  IF sid IS NULL OR NOT public.can_adjust_customer_balance() THEN RAISE EXCEPTION 'You do not have permission to raise debtor interest'; END IF;
  SELECT debtor_interest_rate, interest_after_days INTO v_rate, v_days FROM public.settings WHERE store_id=sid LIMIT 1;
  IF coalesce(v_rate,0) <= 0 THEN RETURN 0; END IF;
  FOR r IN SELECT * FROM public.debtor_overdue(current_date, v_days) LOOP
    IF round(r.amount*v_rate/100,2) > 0 THEN
      INSERT INTO public.customer_adjustments (customer_id, kind, amount, note, created_by, period, store_id)
      VALUES (r.customer_id, 'interest', round(r.amount*v_rate/100,2),
        'Interest '||v_rate||'% on overdue $'||to_char(r.amount,'FM999999990.00')||' for '||v_period, auth.uid(), v_period, sid)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN n := n + 1; END IF;
    END IF;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.raise_debtor_interest() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.raise_debtor_interest() TO authenticated;

CREATE OR REPLACE FUNCTION public.save_debtor_rules(p_interest numeric, p_interest_days int, p_provision numeric, p_provision_days int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.current_store_id() IS NULL OR NOT public.is_owner_admin(auth.uid()) THEN RAISE EXCEPTION 'Only the owner can change debtor rules'; END IF;
  UPDATE public.settings SET debtor_interest_rate=p_interest, interest_after_days=p_interest_days,
    bad_debt_provision_rate=p_provision, provision_after_days=p_provision_days WHERE store_id=public.current_store_id();
END $$;
REVOKE ALL ON FUNCTION public.save_debtor_rules(numeric,int,numeric,int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_debtor_rules(numeric,int,numeric,int) TO authenticated;

-- Balance now includes manual adjustments and interest, so credit limits see them.
CREATE OR REPLACE FUNCTION public.customer_balance(p_customer uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result numeric; sid uuid:=public.current_store_id();
BEGIN
  IF sid IS NULL OR NOT public.is_staff(auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.customers WHERE id=p_customer AND store_id=sid) THEN RAISE EXCEPTION 'Customer not found'; END IF;
  SELECT round(
    coalesce((SELECT sum(p.amount/nullif(p.exchange_rate,0)) FROM public.sale_payments p JOIN public.sales s ON s.id=p.sale_id WHERE s.customer_id=p_customer AND s.store_id=sid AND public.is_account_method(p.method)),0)
    - coalesce((SELECT sum(amount) FROM public.customer_payments WHERE customer_id=p_customer AND store_id=sid),0)
    - coalesce((SELECT sum(r.amount) FROM public.refunds r JOIN public.sales s ON s.id=r.sale_id WHERE s.customer_id=p_customer AND r.store_id=sid AND public.is_account_method(r.method)),0)
    + coalesce((SELECT sum(CASE WHEN kind='credit' THEN -amount ELSE amount END) FROM public.customer_adjustments WHERE customer_id=p_customer AND store_id=sid),0)
  ,2) INTO result;
  RETURN result;
END $$;

-- Ledger: interest posts to Interest income; provision derived as at report date.
DO $do$
DECLARE def text;
BEGIN
  def := pg_get_functiondef('public.gl_lines(date)'::regprocedure);
  def := replace(def, $q$CASE WHEN a.kind='charge' THEN '1100' ELSE '6100' END$q$, $q$CASE WHEN a.kind IN ('charge','interest') THEN '1100' ELSE '6100' END$q$);
  def := replace(def, $q$CASE WHEN a.kind='charge' THEN '4300' ELSE '1100' END$q$, $q$CASE WHEN a.kind='interest' THEN '4400' WHEN a.kind='charge' THEN '4300' ELSE '1100' END$q$);
  def := replace(def, 'FUNCTION public.gl_lines(', 'FUNCTION public.gl_lines_base(');
  EXECUTE def;
END $do$;
REVOKE ALL ON FUNCTION public.gl_lines_base(date) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gl_lines(p_to date)
RETURNS TABLE(entry_date date, source text, reference text, memo text, account_code text, debit numeric, credit numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rate numeric; v_days int; v_prov numeric;
BEGIN
  RETURN QUERY SELECT * FROM public.gl_lines_base(p_to);
  SELECT bad_debt_provision_rate, provision_after_days INTO v_rate, v_days FROM public.settings WHERE store_id=public.current_store_id() LIMIT 1;
  SELECT round(coalesce(sum(o.amount),0)*coalesce(v_rate,0)/100,2) INTO v_prov FROM public.debtor_overdue(p_to, coalesce(v_days,120)) o;
  IF v_prov > 0 THEN
    RETURN QUERY VALUES
      (p_to, 'provision'::text, 'PROV'::text, ('Bad debt provision '||v_rate||'% on debt '||v_days||'+ days')::text, '6200'::text, v_prov, 0::numeric),
      (p_to, 'provision', 'PROV', ('Bad debt provision '||v_rate||'% on debt '||v_days||'+ days'), '1150', 0::numeric, v_prov);
  END IF;
END $$;