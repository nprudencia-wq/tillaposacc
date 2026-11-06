CREATE OR REPLACE FUNCTION public.open_offline_shift(p_id uuid, p_opened_at timestamptz, p_float_usd numeric, p_float_zig numeric, p_float_zar numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record;
BEGIN
  IF NOT public.is_staff(auth.uid()) OR public.current_store_id() IS NULL THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF p_id IS NULL THEN RAISE EXCEPTION 'Missing shift reference'; END IF;
  IF least(coalesce(p_float_usd,0), coalesce(p_float_zig,0), coalesce(p_float_zar,0)) < 0 THEN RAISE EXCEPTION 'Float cannot be negative'; END IF;
  SELECT * INTO v FROM cashier_shifts WHERE id = p_id;
  IF found THEN
    IF v.cashier_id <> auth.uid() OR v.store_id IS DISTINCT FROM public.current_store_id() THEN RAISE EXCEPTION 'Shift belongs to someone else'; END IF;
    RETURN to_jsonb(v) || jsonb_build_object('duplicate', true);
  END IF;
  SELECT * INTO v FROM cashier_shifts WHERE cashier_id = auth.uid() AND status = 'open' AND store_id = public.current_store_id();
  IF found THEN RETURN to_jsonb(v) || jsonb_build_object('merged', true); END IF;
  INSERT INTO cashier_shifts (id, cashier_id, store_id, opened_at, opening_float_usd, opening_float_zig, opening_float_zar)
  VALUES (p_id, auth.uid(), public.current_store_id(),
          least(greatest(coalesce(p_opened_at, now()), now() - interval '7 days'), now()),
          coalesce(p_float_usd,0), coalesce(p_float_zig,0), coalesce(p_float_zar,0))
  RETURNING * INTO v;
  RETURN to_jsonb(v);
END $$;
REVOKE ALL ON FUNCTION public.open_offline_shift(uuid,timestamptz,numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_offline_shift(uuid,timestamptz,numeric,numeric,numeric) TO authenticated;