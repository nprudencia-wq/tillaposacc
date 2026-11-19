CREATE OR REPLACE FUNCTION public.shift_summary(p_shift uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; result jsonb; c text; suffix text; cash numeric; chg numeric; ref numeric; pin numeric; pout numeric; fl numeric;
BEGIN
SELECT * INTO s FROM public.cashier_shifts WHERE id=p_shift AND store_id=public.current_store_id(); IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
IF auth.uid() IS NULL OR NOT (public.can_refund(auth.uid()) OR public.can_post_expense(auth.uid()) OR s.cashier_id=auth.uid()) THEN RAISE EXCEPTION 'Not authorised to read this shift'; END IF;
result:=jsonb_build_object('shift',to_jsonb(s),'sales_count',(SELECT count(*) FROM public.sales WHERE shift_id=p_shift),'sales_total_usd',(SELECT coalesce(sum(total),0) FROM public.sales WHERE shift_id=p_shift),'payments',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM (SELECT p.method,p.currency,sum(p.amount) amount FROM public.sale_payments p JOIN public.sales x ON x.id=p.sale_id WHERE x.shift_id=p_shift GROUP BY p.method,p.currency) t),'movements',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.created_at),'[]'::jsonb) FROM public.shift_cash_movements m WHERE shift_id=p_shift));
FOREACH c IN ARRAY ARRAY['USD','ZiG','ZAR'] LOOP
suffix:=CASE c WHEN 'USD' THEN 'usd' WHEN 'ZiG' THEN 'zig' ELSE 'zar' END;
SELECT coalesce(sum(p.amount),0) INTO cash FROM public.sale_payments p JOIN public.sales x ON x.id=p.sale_id WHERE x.shift_id=p_shift AND p.currency=c AND public.is_cash_method(p.method);
SELECT coalesce(sum(change_given*CASE WHEN c='USD' THEN 1 ELSE exchange_rate END),0) INTO chg FROM public.sales WHERE shift_id=p_shift AND currency=c;
SELECT coalesce(sum(r.amount*CASE WHEN c='USD' THEN 1 ELSE x.exchange_rate END),0) INTO ref FROM public.refunds r JOIN public.sales x ON x.id=r.sale_id WHERE r.shift_id=p_shift AND x.currency=c AND public.is_cash_method(r.method);
SELECT coalesce(sum(amount) FILTER(WHERE type='paid_in'),0),coalesce(sum(amount) FILTER(WHERE type<>'paid_in'),0) INTO pin,pout FROM public.shift_cash_movements WHERE shift_id=p_shift AND currency=c;
fl:=(to_jsonb(s)->>('opening_float_'||suffix))::numeric;
result:=result||jsonb_build_object('cash_in_'||suffix,cash,'change_'||suffix,round(chg,2),'refunds_'||suffix,round(ref,2),'paid_in_'||suffix,pin,'paid_out_'||suffix,pout,'expected_'||suffix,round(fl+cash-chg-ref+pin-pout,2));
END LOOP; RETURN result; END $$;
REVOKE ALL ON FUNCTION public.shift_summary(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.shift_summary(uuid) TO authenticated;