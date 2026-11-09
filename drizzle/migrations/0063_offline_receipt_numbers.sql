CREATE TABLE public.sale_number_reservations (
  number bigint PRIMARY KEY,
  store_id uuid NOT NULL,
  user_id uuid NOT NULL,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);
GRANT ALL ON public.sale_number_reservations TO service_role;
ALTER TABLE public.sale_number_reservations ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.sale_number_reservations IS 'Receipt numbers handed to a till for offline sales; written only by reserve_sale_numbers and the sales insert trigger.';

CREATE OR REPLACE FUNCTION public.reserve_sale_numbers(p_count int)
RETURNS bigint[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store uuid := public.current_store_id(); v_out bigint[] := '{}'; v_n bigint; i int;
BEGIN
  IF NOT public.is_staff(auth.uid()) OR v_store IS NULL THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF p_count IS NULL OR p_count < 1 OR p_count > 100 THEN RAISE EXCEPTION 'Invalid count'; END IF;
  IF (SELECT count(*) FROM sale_number_reservations WHERE store_id = v_store AND user_id = auth.uid() AND used_at IS NULL) >= 200 THEN RAISE EXCEPTION 'Too many unused receipt numbers'; END IF;
  FOR i IN 1..p_count LOOP
    v_n := nextval('public.sale_number_seq');
    INSERT INTO sale_number_reservations(number, store_id, user_id) VALUES (v_n, v_store, auth.uid());
    v_out := v_out || v_n;
  END LOOP;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public.reserve_sale_numbers(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_sale_numbers(int) TO authenticated;

-- Offline sales carry client_ref 'RSV-<number>-<uuid>'; a valid unused reservation for the same
-- store and cashier becomes the sale's TXN number. Anything else keeps the normal next number.
CREATE OR REPLACE FUNCTION public.apply_reserved_sale_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n bigint;
BEGIN
  IF NEW.client_ref ~ '^RSV-[0-9]{1,15}-' THEN
    v_n := substring(NEW.client_ref from '^RSV-([0-9]+)-')::bigint;
    UPDATE sale_number_reservations SET used_at = now()
      WHERE number = v_n AND store_id = NEW.store_id AND user_id = NEW.cashier_id AND used_at IS NULL;
    IF FOUND THEN NEW.sale_number := 'TXN-' || v_n; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.apply_reserved_sale_number() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER a_apply_reserved_sale_number BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.apply_reserved_sale_number();