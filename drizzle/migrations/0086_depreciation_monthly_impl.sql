CREATE OR REPLACE FUNCTION public.run_depreciation_through_impl(p_year integer, p_month integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s uuid := public.current_store_id(); a record; v_today date := (now() AT TIME ZONE 'Africa/Harare')::date;
 v_target date; m date; v_end date; v_cost numeric; v_acc numeric; v_amt numeric; v_ad text; n int := 0;
BEGIN
 IF s IS NULL OR NOT public.can_view_accounts(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 v_target := make_date(p_year,p_month,1);
 IF EXISTS(SELECT 1 FROM public.asset_depreciation WHERE store_id=s AND start_date IS NULL) THEN RAISE EXCEPTION 'Set the first-used date for every asset before posting depreciation'; END IF;
 FOR a IN SELECT d.*, g.name FROM public.asset_depreciation d JOIN public.gl_accounts g ON g.store_id=d.store_id AND g.code=d.account_code
   WHERE d.store_id=s AND d.start_date <= (v_target + interval '1 month -1 day')::date FOR UPDATE OF d LOOP
  v_ad := a.account_code||'-AD';
  m := greatest(date_trunc('month',a.start_date)::date,
       coalesce((a.last_month + interval '1 month')::date, '0001-01-01'),
       coalesce(make_date(a.last_year+1,1,1), '0001-01-01'));
  WHILE m <= v_target LOOP
   v_end := (m + interval '1 month -1 day')::date;
   SELECT coalesce(sum(l.debit-l.credit),0) INTO v_cost FROM public.journal_lines l JOIN public.journal_entries e ON e.id=l.entry_id
    WHERE l.store_id=s AND e.store_id=s AND l.account_code=a.account_code AND e.entry_date<=v_end;
   SELECT coalesce(sum(credit-debit),0) INTO v_acc FROM public.journal_lines WHERE store_id=s AND account_code=v_ad;
   v_amt := public.asset_month_depreciation(v_cost,v_acc,a.rate,a.start_date,m,v_end);
   IF v_amt > 0 THEN
    PERFORM public.save_gl_account('6300','Depreciation expense','expense',true);
    PERFORM public.save_gl_account(v_ad,'Accumulated depreciation - '||a.name,'asset',true);
    PERFORM public.post_journal(v_end,'Depreciation '||to_char(m,'Mon YYYY')||' - '||a.name||' at '||a.rate||'% p.a. (pro-rata)',
     jsonb_build_array(jsonb_build_object('account','6300','debit',v_amt,'credit',0),jsonb_build_object('account',v_ad,'debit',0,'credit',v_amt)));
    n := n + 1;
   END IF;
   UPDATE public.asset_depreciation SET last_month=m, last_year=CASE WHEN extract(month FROM m)=12 THEN extract(year FROM m)::int ELSE last_year END, updated_at=now()
    WHERE store_id=s AND account_code=a.account_code;
   m := (m + interval '1 month')::date;
  END LOOP;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.run_depreciation_through_impl(integer,integer) FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.run_depreciation_through(integer,integer) SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.run_depreciation(p_year integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_today date := (now() AT TIME ZONE 'Africa/Harare')::date; v_last date;
BEGIN
 IF p_year IS NULL OR p_year < 1 OR p_year > extract(year FROM v_today)::int THEN RAISE EXCEPTION 'Choose a valid year, not a future year'; END IF;
 v_last := least(make_date(p_year,12,1), (date_trunc('month',v_today) - interval '1 month')::date);
 IF v_last < make_date(p_year,1,1) THEN RAISE EXCEPTION 'No finished month to post yet for %', p_year; END IF;
 RETURN public.run_depreciation_through(extract(year FROM v_last)::int, extract(month FROM v_last)::int);
END $$;