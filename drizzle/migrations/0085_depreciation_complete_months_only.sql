CREATE OR REPLACE FUNCTION public.run_depreciation_through(p_year integer, p_month integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_today date := (now() AT TIME ZONE 'Africa/Harare')::date; m int := p_month; y int := p_year;
BEGIN
 IF p_year IS NULL OR p_month IS NULL OR p_month < 1 OR p_month > 12 OR p_year < 1 THEN RAISE EXCEPTION 'Choose a valid month'; END IF;
 IF (make_date(y,m,1) + interval '1 month -1 day')::date >= v_today AND make_date(y,m,1) <= v_today THEN
   RAISE EXCEPTION 'That month has not finished yet; post it after month end'; END IF;
 IF make_date(y,m,1) > v_today THEN RAISE EXCEPTION 'Cannot depreciate a future month'; END IF;
 RETURN public.run_depreciation_through_impl(y,m);
END $$;