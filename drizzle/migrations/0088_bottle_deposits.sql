INSERT INTO public.gl_accounts(store_id,code,name,type,system) SELECT id,'2300','Bottle deposits held','liability',true FROM public.stores ON CONFLICT DO NOTHING;
INSERT INTO public.gl_accounts(store_id,code,name,type,system) SELECT id,'4350','Unclaimed bottle deposits','income',true FROM public.stores ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.add_staff_takings_defaults() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.gl_accounts(store_id,code,name,type,system) VALUES(NEW.id,'1160','Staff takings (staff debtors)','asset',true),(NEW.id,'2300','Bottle deposits held','liability',true),(NEW.id,'4350','Unclaimed bottle deposits','income',true) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.gl_lines(p_to date)
 RETURNS TABLE(entry_date date, source text, reference text, memo text, account_code text, debit numeric, credit numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_rate numeric; v_days int; v_prov numeric;
BEGIN
  RETURN QUERY SELECT * FROM public.gl_lines_base(p_to);
  -- Bottle deposits: cash in the drawer owed back to customers, never sales.
  RETURN QUERY SELECT (m.created_at AT TIME ZONE 'Africa/Harare')::date, 'deposit'::text, 'DEP'::text, m.reason, x.acc,
      CASE WHEN x.dr THEN u.usd ELSE 0 END, CASE WHEN x.dr THEN 0 ELSE u.usd END
    FROM public.shift_cash_movements m
    CROSS JOIN LATERAL (SELECT round(m.amount / nullif(CASE m.currency WHEN 'USD' THEN 1 ELSE public.currency_rate(m.currency) END,0),2) usd) u
    CROSS JOIN LATERAL (VALUES ('1000', m.type='paid_in'), ('2300', m.type<>'paid_in')) x(acc,dr)
    WHERE m.store_id=public.current_store_id() AND m.reason LIKE 'Bottle deposit%' AND (m.created_at AT TIME ZONE 'Africa/Harare')::date <= p_to;
  SELECT bad_debt_provision_rate, provision_after_days INTO v_rate, v_days FROM public.settings WHERE store_id=public.current_store_id() LIMIT 1;
  SELECT round(coalesce(sum(o.amount),0)*coalesce(v_rate,0)/100,2) INTO v_prov FROM public.debtor_overdue(p_to, coalesce(v_days,120)) o;
  IF v_prov > 0 THEN
    RETURN QUERY VALUES
      (p_to, 'provision'::text, 'PROV'::text, ('Bad debt provision '||v_rate||'% on debt '||v_days||'+ days')::text, '6200'::text, v_prov, 0::numeric),
      (p_to, 'provision', 'PROV', ('Bad debt provision '||v_rate||'% on debt '||v_days||'+ days'), '1150', 0::numeric, v_prov);
  END IF;
END $function$;
DO $$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public.auto_close_daily_settlements(date)'::regprocedure);
  d := replace(d, 'AND NOT (type = ''paid_in'' AND coalesce(reason,'''') LIKE ''Debt payment from%'')', 'AND NOT (type = ''paid_in'' AND coalesce(reason,'''') LIKE ''Debt payment from%'') AND coalesce(reason,'''') NOT LIKE ''Bottle deposit%''');
  EXECUTE d;
END $$;