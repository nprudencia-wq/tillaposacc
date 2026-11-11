CREATE OR REPLACE FUNCTION public.force_close_shift(p_shift uuid,p_actual_usd numeric,p_actual_zig numeric,p_actual_zar numeric,p_notes text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE s record; result jsonb; BEGIN
IF NOT (public.is_staff(auth.uid()) AND public.has_permission(auth.uid(),'module_shifts') AND public.can_refund(auth.uid())) THEN RAISE EXCEPTION 'Only managers can force close a shift'; END IF;
IF p_actual_usd IS NULL OR p_actual_zig IS NULL OR p_actual_zar IS NULL OR least(p_actual_usd,p_actual_zig,p_actual_zar)<0 THEN RAISE EXCEPTION 'Count all three currencies (zero if none)'; END IF;
SELECT * INTO s FROM public.cashier_shifts WHERE id=p_shift AND status='open' AND store_id=public.current_store_id() FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Shift is not open'; END IF;
UPDATE public.cashier_shifts SET status='closed',closed_at=now() WHERE id=s.id;
result:=public.shift_summary(s.id);
UPDATE public.cashier_shifts SET actual_cash_usd=p_actual_usd,actual_cash_zig=p_actual_zig,actual_cash_zar=p_actual_zar,expected_cash_usd=(result->>'expected_usd')::numeric,expected_cash_zig=(result->>'expected_zig')::numeric,expected_cash_zar=(result->>'expected_zar')::numeric,variance_usd=p_actual_usd-(result->>'expected_usd')::numeric,variance_zig=p_actual_zig-(result->>'expected_zig')::numeric,variance_zar=p_actual_zar-(result->>'expected_zar')::numeric,notes=nullif(trim(p_notes),''),manager_notes=trim(coalesce(manager_notes,'')||' Force closed by manager.') WHERE id=s.id;
INSERT INTO public.activity_log(user_id,action,details,store_id) VALUES(auth.uid(),'shift_force_closed',s.shift_number,s.store_id);
RETURN s.id; END $$;
REVOKE ALL ON FUNCTION public.force_close_shift(uuid,numeric,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.force_close_shift(uuid,numeric,numeric,numeric,text) TO authenticated;