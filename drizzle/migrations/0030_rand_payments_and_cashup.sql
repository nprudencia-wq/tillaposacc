DO $$ DECLARE d text; n text; BEGIN
FOREACH n IN ARRAY ARRAY['public.customer_balance(uuid)','public.gl_lines(date)'] LOOP SELECT pg_get_functiondef(n::regprocedure) INTO d; d:=replace(d,'case when sp.currency=''ZiG'' then sp.amount / nullif(s.exchange_rate,0) else sp.amount end','sp.amount / nullif(sp.exchange_rate,0)'); d:=replace(d,'CASE WHEN sp.currency=''ZiG'' THEN sp.amount/nullif(s.exchange_rate,0) ELSE sp.amount END','sp.amount/nullif(sp.exchange_rate,0)'); EXECUTE d; END LOOP;
SELECT pg_get_functiondef('public.post_expense(date,text,text,numeric,text,text,text)'::regprocedure) INTO d;
d:=replace(d,'IF p_currency = ''ZiG'' THEN SELECT zig_rate INTO v_rate FROM public.settings WHERE id = 1;'||chr(10)||'  ELSIF p_currency <> ''USD'' THEN RAISE EXCEPTION ''Unknown currency''; END IF;','SELECT public.currency_rate(p_currency,zig_rate,rand_rate) INTO v_rate FROM public.settings WHERE store_id=public.current_store_id();'); EXECUTE d;
SELECT pg_get_functiondef('public.receive_customer_payment(uuid,numeric,text,text,text)'::regprocedure) INTO d;
d:=replace(d,'where id = p_customer;','where id = p_customer and store_id=public.current_store_id();');
d:=replace(d,'select zig_rate into v_rate from settings where id = 1;','select public.currency_rate(p_currency,zig_rate,rand_rate) into v_rate from settings where store_id=public.current_store_id();');
d:=replace(d,'round(case when p_currency = ''ZiG'' then p_amount / v_rate else p_amount end, 2)','round(p_amount / v_rate,2)'); d:=replace(d,'case when p_currency=''ZiG'' then v_rate else 1 end','v_rate'); EXECUTE d;
SELECT pg_get_functiondef('public.record_cash_movement(text,text,numeric,text)'::regprocedure) INTO d; d:=replace(d,'p_currency not in (''USD'',''ZiG'')','p_currency not in (''USD'',''ZiG'',''ZAR'')'); EXECUTE d;
END $$;
CREATE OR REPLACE FUNCTION public.open_shift_three(p_float_usd numeric,p_float_zig numeric,p_float_zar numeric) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r jsonb; BEGIN IF p_float_zar IS NULL OR p_float_zar<0 THEN RAISE EXCEPTION 'Invalid Rand float'; END IF; r:=public.open_shift(p_float_usd,p_float_zig); UPDATE public.cashier_shifts SET opening_float_zar=p_float_zar WHERE id=(r->>'id')::uuid AND store_id=public.current_store_id(); RETURN r||jsonb_build_object('opening_float_zar',p_float_zar); END $$;
REVOKE ALL ON FUNCTION public.open_shift_three(numeric,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.open_shift_three(numeric,numeric,numeric) TO authenticated;
CREATE OR REPLACE FUNCTION public.shift_summary(p_shift uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; result jsonb; c text; suffix text; cash numeric; chg numeric; ref numeric; pin numeric; pout numeric; fl numeric;
BEGIN
SELECT * INTO s FROM public.cashier_shifts WHERE id=p_shift AND store_id=public.current_store_id(); IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
IF NOT (public.can_refund(auth.uid()) OR public.can_post_expense(auth.uid()) OR (s.cashier_id=auth.uid() AND s.status='closed')) THEN RAISE EXCEPTION 'Not authorised to read this shift'; END IF;
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
CREATE OR REPLACE FUNCTION public.close_shift_three(p_actual_usd numeric,p_actual_zig numeric,p_actual_zar numeric,p_notes text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE s record; result jsonb; BEGIN
IF p_actual_usd IS NULL OR p_actual_zig IS NULL OR p_actual_zar IS NULL OR least(p_actual_usd,p_actual_zig,p_actual_zar)<0 THEN RAISE EXCEPTION 'Count all three currencies (zero if none)'; END IF;
SELECT * INTO s FROM public.cashier_shifts WHERE cashier_id=auth.uid() AND status='open' AND store_id=public.current_store_id() FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'No open shift'; END IF;
UPDATE public.cashier_shifts SET status='closed',closed_at=now() WHERE id=s.id;
result:=public.shift_summary(s.id);
UPDATE public.cashier_shifts SET actual_cash_usd=p_actual_usd,actual_cash_zig=p_actual_zig,actual_cash_zar=p_actual_zar,expected_cash_usd=(result->>'expected_usd')::numeric,expected_cash_zig=(result->>'expected_zig')::numeric,expected_cash_zar=(result->>'expected_zar')::numeric,variance_usd=p_actual_usd-(result->>'expected_usd')::numeric,variance_zig=p_actual_zig-(result->>'expected_zig')::numeric,variance_zar=p_actual_zar-(result->>'expected_zar')::numeric,notes=nullif(trim(p_notes),'') WHERE id=s.id; RETURN s.id; END $$;
REVOKE ALL ON FUNCTION public.close_shift_three(numeric,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.close_shift_three(numeric,numeric,numeric,text) TO authenticated;