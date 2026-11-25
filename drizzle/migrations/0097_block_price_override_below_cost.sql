CREATE OR REPLACE FUNCTION public.guard_price_override_floor()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.original_price IS NOT NULL AND NEW.unit_price <> NEW.original_price
     AND NEW.unit_price < COALESCE(NEW.cost_price, 0) THEN
    RAISE EXCEPTION 'A changed price cannot be below the cost price';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_price_override_floor() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sale_items_price_override_floor ON public.sale_items;
CREATE TRIGGER sale_items_price_override_floor BEFORE INSERT OR UPDATE OF unit_price ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.guard_price_override_floor();