CREATE OR REPLACE FUNCTION public.open_offline_shift(p_id uuid, p_opened_at timestamptz, p_float_usd numeric, p_float_zig numeric, p_float_zar numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v record; v_when timestamptz;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF p_id IS NULL THEN RAISE EXCEPTION 'Missing shift reference'; END IF;
  SELECT * INTO v FROM cashier_shifts WHERE id = p_id;
  IF FOUND THEN
    IF v.cashier_id <> auth.uid() OR v.store_id <> public.current_store_id() THEN RAISE EXCEPTION 'Shift belongs to someone else'; END IF;
    RETURN to_jsonb(v) || jsonb_build_object('duplicate', true);
  END IF;
  IF least(coalesce(p_float_usd,0), coalesce(p_float_zig,0), coalesce(p_float_zar,0)) < 0 THEN RAISE EXCEPTION 'Float cannot be negative'; END IF;
  IF EXISTS (SELECT 1 FROM cashier_shifts WHERE cashier_id = auth.uid() AND status = 'open') THEN RAISE EXCEPTION 'You already have an open shift'; END IF;
  v_when := least(greatest(coalesce(p_opened_at, now()), now() - interval '7 days'), now());
  INSERT INTO cashier_shifts (id, cashier_id, opened_at, opening_float_usd, opening_float_zig, opening_float_zar)
  VALUES (p_id, auth.uid(), v_when, coalesce(p_float_usd,0), coalesce(p_float_zig,0), coalesce(p_float_zar,0)) RETURNING * INTO v;
  RETURN to_jsonb(v);
END $$;

CREATE OR REPLACE FUNCTION public.close_offline_shift(p_id uuid, p_closed_at timestamptz, p_actual_usd numeric, p_actual_zig numeric, p_actual_zar numeric, p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s record; result jsonb;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF p_actual_usd IS NULL OR p_actual_zig IS NULL OR p_actual_zar IS NULL OR least(p_actual_usd,p_actual_zig,p_actual_zar) < 0 THEN RAISE EXCEPTION 'Count all three currencies (zero if none)'; END IF;
  SELECT * INTO s FROM cashier_shifts WHERE id = p_id AND cashier_id = auth.uid() AND store_id = public.current_store_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
  IF s.status = 'closed' THEN RETURN s.id; END IF;
  UPDATE cashier_shifts SET status = 'closed', closed_at = least(greatest(coalesce(p_closed_at, now()), s.opened_at), now()) WHERE id = s.id;
  result := public.shift_summary(s.id);
  UPDATE cashier_shifts SET actual_cash_usd = p_actual_usd, actual_cash_zig = p_actual_zig, actual_cash_zar = p_actual_zar,
    expected_cash_usd = (result->>'expected_usd')::numeric, expected_cash_zig = (result->>'expected_zig')::numeric, expected_cash_zar = (result->>'expected_zar')::numeric,
    variance_usd = p_actual_usd - (result->>'expected_usd')::numeric, variance_zig = p_actual_zig - (result->>'expected_zig')::numeric, variance_zar = p_actual_zar - (result->>'expected_zar')::numeric,
    notes = nullif(trim(p_notes), '') WHERE id = s.id;
  RETURN s.id;
END $$;

REVOKE ALL ON FUNCTION public.open_offline_shift(uuid, timestamptz, numeric, numeric, numeric) FROM public, anon;
REVOKE ALL ON FUNCTION public.close_offline_shift(uuid, timestamptz, numeric, numeric, numeric, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.open_offline_shift(uuid, timestamptz, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_offline_shift(uuid, timestamptz, numeric, numeric, numeric, text) TO authenticated;