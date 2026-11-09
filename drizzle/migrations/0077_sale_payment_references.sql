ALTER TABLE public.sale_payments ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE public.sale_payments ADD CONSTRAINT sale_payments_reference_len CHECK (reference IS NULL OR length(reference) <= 80) NOT VALID;

-- The selling cashier may attach card/mobile approval codes to non-cash payments of their own sale, once, within a day.
CREATE OR REPLACE FUNCTION public.set_sale_payment_references(p_sale_number text, p_refs jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sale uuid; v_n integer := 0; r jsonb;
BEGIN
  SELECT s.id INTO v_sale FROM sales s
   WHERE s.sale_number = p_sale_number AND s.cashier_id = auth.uid()
     AND s.created_at > now() - interval '1 day'
     AND public.is_staff(auth.uid());
  IF v_sale IS NULL THEN RAISE EXCEPTION 'Sale not found'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_refs, '[]'::jsonb)) LOOP
    UPDATE sale_payments sp SET reference = left(trim(r->>'reference'), 80)
     WHERE sp.id = (SELECT sp2.id FROM sale_payments sp2
                     WHERE sp2.sale_id = v_sale AND sp2.method = r->>'method' AND sp2.currency = r->>'currency'
                       AND sp2.reference IS NULL AND NOT public.is_cash_method(sp2.method)
                     ORDER BY sp2.id LIMIT 1)
       AND coalesce(trim(r->>'reference'), '') <> '';
    IF FOUND THEN v_n := v_n + 1; END IF;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.set_sale_payment_references(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_sale_payment_references(text, jsonb) TO authenticated;