ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS interest_auto boolean NOT NULL DEFAULT true;
CREATE OR REPLACE FUNCTION public.save_interest_mode(p_auto boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.current_store_id() IS NULL OR NOT public.is_owner_admin(auth.uid()) THEN RAISE EXCEPTION 'Only the owner can change debtor rules'; END IF;
  UPDATE public.settings SET interest_auto=p_auto WHERE store_id=public.current_store_id();
END $$;
REVOKE ALL ON FUNCTION public.save_interest_mode(boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_interest_mode(boolean) TO authenticated;