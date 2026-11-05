DROP POLICY IF EXISTS "Product images public read" ON storage.objects;
CREATE POLICY "Staff read product images" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-images' AND public.is_staff(auth.uid()));