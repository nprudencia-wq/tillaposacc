ALTER TABLE public.asset_depreciation ADD COLUMN start_date date;
COMMENT ON COLUMN public.asset_depreciation.start_date IS 'First date the asset was used; required before depreciation can be posted. Existing journals are not rewritten.';

CREATE OR REPLACE FUNCTION public.asset_depreciation_amount(p_cost numeric, p_acc numeric, p_rate numeric, p_start date, p_year integer, p_asof date) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN p_start IS NULL OR p_year < 1 OR p_year > 9998 OR p_asof IS NULL THEN 0::numeric ELSE
 round(greatest(0, least(p_cost-p_acc, p_cost*p_rate/100 *
 greatest(0, least(make_date(p_year,12,31),p_asof)-greatest(make_date(p_year,1,1),p_start)+1)::numeric /
 (make_date(p_year+1,1,1)-make_date(p_year,1,1)))),2) END
$$;
REVOKE ALL ON FUNCTION public.asset_depreciation_amount(numeric,numeric,numeric,date,integer,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asset_depreciation_amount(numeric,numeric,numeric,date,integer,date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_asset_depreciation(p_code text, p_rate numeric, p_start_date date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s uuid := public.current_store_id(); existing public.asset_depreciation;
BEGIN
 IF s IS NULL OR NOT public.can_view_accounts(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.gl_accounts WHERE store_id=s AND code=p_code AND type='asset' AND NOT system AND code NOT LIKE '%-AD') THEN RAISE EXCEPTION 'Depreciation can only be set on your own asset accounts'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(s::text || ':depreciation:' || p_code,0));
 SELECT * INTO existing FROM public.asset_depreciation WHERE store_id=s AND account_code=p_code FOR UPDATE;
 IF p_rate IS NULL OR p_rate::text IN ('NaN','Infinity','-Infinity') OR p_rate < 0 OR p_rate > 100 THEN RAISE EXCEPTION 'Rate must be between 0 and 100%%'; END IF;
 IF existing.last_year IS NOT NULL AND existing.start_date IS NOT NULL AND p_start_date IS DISTINCT FROM existing.start_date THEN RAISE EXCEPTION 'First-used date cannot change after depreciation has been posted'; END IF;
 IF p_rate=0 THEN DELETE FROM public.asset_depreciation WHERE store_id=s AND account_code=p_code; RETURN; END IF;
 IF p_start_date IS NULL THEN RAISE EXCEPTION 'Enter the date the asset was first used'; END IF;
 INSERT INTO public.asset_depreciation(store_id,account_code,rate,start_date) VALUES(s,p_code,p_rate,p_start_date)
 ON CONFLICT(store_id,account_code) DO UPDATE SET rate=excluded.rate,start_date=excluded.start_date,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.set_asset_depreciation(text,numeric,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_asset_depreciation(text,numeric,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_asset_depreciation(p_code text, p_rate numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_start date;
BEGIN
 SELECT start_date INTO v_start FROM public.asset_depreciation WHERE store_id=public.current_store_id() AND account_code=p_code;
 PERFORM public.set_asset_depreciation(p_code,p_rate,v_start);
END $$;

CREATE OR REPLACE FUNCTION public.run_depreciation(p_year integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s uuid := public.current_store_id(); a record; v_cost numeric; v_acc numeric; v_amt numeric; v_ad text; v_date date; n int:=0;
BEGIN
 IF s IS NULL OR NOT public.can_view_accounts(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 IF p_year IS NULL OR p_year < 1 OR p_year > extract(year FROM (now() AT TIME ZONE 'Africa/Harare')::date)::int THEN RAISE EXCEPTION 'Choose a valid year, not a future year'; END IF;
 v_date:=least(make_date(p_year,12,31),(now() AT TIME ZONE 'Africa/Harare')::date);
 IF EXISTS(SELECT 1 FROM public.asset_depreciation WHERE store_id=s AND start_date IS NULL AND (last_year IS NULL OR last_year<p_year)) THEN RAISE EXCEPTION 'Set the first-used date for every asset before posting depreciation'; END IF;
 FOR a IN SELECT d.*,g.name FROM public.asset_depreciation d JOIN public.gl_accounts g ON g.store_id=d.store_id AND g.code=d.account_code WHERE d.store_id=s AND d.start_date<=v_date AND (d.last_year IS NULL OR d.last_year<p_year) FOR UPDATE OF d LOOP
 v_ad:=a.account_code||'-AD';
 SELECT coalesce(sum(l.debit-l.credit),0) INTO v_cost FROM public.journal_lines l JOIN public.journal_entries e ON e.id=l.entry_id WHERE l.store_id=s AND e.store_id=s AND l.account_code=a.account_code AND e.entry_date<=v_date;
 SELECT coalesce(sum(credit-debit),0) INTO v_acc FROM public.journal_lines WHERE store_id=s AND account_code=v_ad;
 v_amt:=public.asset_depreciation_amount(v_cost,v_acc,a.rate,a.start_date,p_year,v_date);
 IF v_amt>0 THEN
 PERFORM public.save_gl_account('6300','Depreciation expense','expense',true);
 PERFORM public.save_gl_account(v_ad,'Accumulated depreciation - '||a.name,'asset',true);
 PERFORM public.post_journal(v_date,'Depreciation '||p_year||' - '||a.name||' at '||a.rate||'% p.a.; first used '||a.start_date,
 jsonb_build_array(jsonb_build_object('account','6300','debit',v_amt,'credit',0),jsonb_build_object('account',v_ad,'debit',0,'credit',v_amt)));
 UPDATE public.asset_depreciation SET last_year=p_year,updated_at=now() WHERE store_id=s AND account_code=a.account_code;
 n:=n+1;
 END IF;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.run_depreciation(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_depreciation(integer) TO authenticated;