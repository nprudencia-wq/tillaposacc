CREATE OR REPLACE FUNCTION public.guard_price_override_floor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sell numeric;
BEGIN
  SELECT selling_price INTO v_sell FROM public.products WHERE id = NEW.product_id;
  IF NEW.unit_price <> COALESCE(NEW.original_price, v_sell, NEW.unit_price)
     AND NEW.unit_price < COALESCE(NEW.cost_price, 0) THEN
    RAISE EXCEPTION 'A changed price cannot be below the cost price';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_price_override_floor() FROM PUBLIC, anon, authenticated;