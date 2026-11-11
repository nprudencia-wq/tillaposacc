CREATE TABLE public.asset_depreciation (
  store_id uuid NOT NULL REFERENCES public.stores(id) DEFAULT public.current_store_id(),
  account_code text NOT NULL,
  rate numeric NOT NULL CHECK (rate > 0 AND rate <= 100),
  last_year integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, account_code)
);
GRANT SELECT ON public.asset_depreciation TO authenticated;
GRANT ALL ON public.asset_depreciation TO service_role;
ALTER TABLE public.asset_depreciation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accounts staff read depreciation" ON public.asset_depreciation FOR SELECT TO authenticated
  USING (store_id = public.current_store_id() AND public.can_view_accounts(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_asset_depreciation(p_code text, p_rate numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s uuid := public.current_store_id();
BEGIN
  IF NOT public.can_view_accounts(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.gl_accounts WHERE store_id=s AND code=p_code AND type='asset' AND NOT system) THEN
    RAISE EXCEPTION 'Depreciation can only be set on your own asset accounts'; END IF;
  IF p_rate IS NULL OR p_rate <= 0 THEN DELETE FROM public.asset_depreciation WHERE store_id=s AND account_code=p_code; RETURN; END IF;
  IF p_rate > 100 THEN RAISE EXCEPTION 'Rate must be 100%% or less'; END IF;
  INSERT INTO public.asset_depreciation(store_id,account_code,rate) VALUES (s,p_code,p_rate)
  ON CONFLICT (store_id,account_code) DO UPDATE SET rate=excluded.rate, updated_at=now();
END $$;

CREATE OR REPLACE FUNCTION public.run_depreciation(p_year integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s uuid := public.current_store_id(); a record; v_cost numeric; v_acc numeric; v_amt numeric;
  v_ad text; v_date date; v_name text; n int := 0;
BEGIN
  IF NOT public.can_view_accounts(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF p_year IS NULL OR p_year > extract(year FROM current_date)::int THEN RAISE EXCEPTION 'Cannot depreciate a future year'; END IF;
  v_date := least(make_date(p_year,12,31), current_date);
  PERFORM public.save_gl_account('6300','Depreciation expense','expense',true);
  FOR a IN SELECT d.*, g.name FROM public.asset_depreciation d JOIN public.gl_accounts g ON g.store_id=d.store_id AND g.code=d.account_code
           WHERE d.store_id=s AND (d.last_year IS NULL OR d.last_year < p_year) FOR UPDATE OF d LOOP
    v_ad := a.account_code || '-AD';
    SELECT coalesce(sum(l.debit-l.credit),0) INTO v_cost FROM public.journal_lines l JOIN public.journal_entries e ON e.id=l.entry_id
      WHERE l.store_id=s AND l.account_code=a.account_code AND e.entry_date <= v_date;
    SELECT coalesce(sum(l.credit-l.debit),0) INTO v_acc FROM public.journal_lines l
      WHERE l.store_id=s AND l.account_code=v_ad;
    v_amt := round(least(v_cost * a.rate / 100, v_cost - v_acc), 2);
    IF v_amt > 0 THEN
      v_name := 'Accumulated depreciation - ' || a.name;
      PERFORM public.save_gl_account(v_ad, v_name, 'asset', true);
      PERFORM public.post_journal(v_date, 'Depreciation ' || p_year || ' - ' || a.name || ' at ' || a.rate || '% p.a.',
        jsonb_build_array(jsonb_build_object('account','6300','debit',v_amt,'credit',0),
                          jsonb_build_object('account',v_ad,'debit',0,'credit',v_amt)));
      n := n + 1;
    END IF;
    UPDATE public.asset_depreciation SET last_year=p_year, updated_at=now() WHERE store_id=s AND account_code=a.account_code;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.set_asset_depreciation(text,numeric) FROM public, anon;
REVOKE ALL ON FUNCTION public.run_depreciation(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_asset_depreciation(text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_depreciation(integer) TO authenticated;