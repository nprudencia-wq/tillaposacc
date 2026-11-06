CREATE OR REPLACE FUNCTION public.close_offline_shift(p_id uuid, p_closed_at timestamptz, p_actual_usd numeric, p_actual_zig numeric, p_actual_zar numeric, p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; result jsonb;
BEGIN
  IF NOT public.is_staff(auth.uid()) OR public.current_store_id() IS NULL THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF p_actual_usd IS NULL OR p_actual_zig IS NULL OR p_actual_zar IS NULL OR least(p_actual_usd,p_actual_zig,p_actual_zar) < 0 THEN RAISE EXCEPTION 'Count all three currencies (zero if none)'; END IF;
  SELECT * INTO s FROM public.cashier_shifts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
  IF s.cashier_id <> auth.uid() OR s.store_id IS DISTINCT FROM public.current_store_id() THEN RAISE EXCEPTION 'Shift belongs to someone else'; END IF;
  IF s.status <> 'open' THEN RETURN s.id; END IF; -- already closed: retry is harmless
  UPDATE public.cashier_shifts SET status = 'closed',
    closed_at = least(greatest(coalesce(p_closed_at, now()), s.opened_at), now())
  WHERE id = s.id;
  result := public.shift_summary(s.id);
  UPDATE public.cashier_shifts SET actual_cash_usd=p_actual_usd, actual_cash_zig=p_actual_zig, actual_cash_zar=p_actual_zar,
    expected_cash_usd=(result->>'expected_usd')::numeric, expected_cash_zig=(result->>'expected_zig')::numeric, expected_cash_zar=(result->>'expected_zar')::numeric,
    variance_usd=p_actual_usd-(result->>'expected_usd')::numeric, variance_zig=p_actual_zig-(result->>'expected_zig')::numeric, variance_zar=p_actual_zar-(result->>'expected_zar')::numeric,
    notes=nullif(trim(p_notes),'')
  WHERE id = s.id;
  RETURN s.id;
END $$;
REVOKE ALL ON FUNCTION public.close_offline_shift(uuid,timestamptz,numeric,numeric,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_offline_shift(uuid,timestamptz,numeric,numeric,numeric,text) TO authenticated;