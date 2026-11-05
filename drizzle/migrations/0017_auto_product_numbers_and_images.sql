CREATE SEQUENCE IF NOT EXISTS public.product_number_seq START 1001;
GRANT USAGE ON SEQUENCE public.product_number_seq TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_product_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.sku IS NULL OR btrim(NEW.sku) = '' THEN
    LOOP
      NEW.sku := 'P' || nextval('public.product_number_seq');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.products WHERE sku = NEW.sku);
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_product_number ON public.products;
CREATE TRIGGER trg_set_product_number BEFORE INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_product_number();

UPDATE public.products SET sku = 'P' || nextval('public.product_number_seq') WHERE sku IS NULL OR btrim(sku) = '';

CREATE POLICY "Product images public read" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "Stock managers upload product images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND public.can_manage_stock(auth.uid()));
CREATE POLICY "Stock managers update product images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND public.can_manage_stock(auth.uid()));
CREATE POLICY "Stock managers delete product images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND public.can_manage_stock(auth.uid()));