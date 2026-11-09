ALTER TABLE public.cashier_shifts ADD COLUMN IF NOT EXISTS device_name text;
CREATE OR REPLACE FUNCTION public.set_shift_device(p_shift uuid, p_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF length(trim(coalesce(p_name,''))) = 0 OR length(p_name) > 40 THEN RAISE EXCEPTION 'Till name must be 1-40 characters'; END IF;
  UPDATE public.cashier_shifts SET device_name = trim(p_name)
   WHERE id = p_shift AND cashier_id = auth.uid() AND store_id = public.current_store_id();
END $$;
REVOKE ALL ON FUNCTION public.set_shift_device(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_shift_device(uuid, text) TO authenticated;