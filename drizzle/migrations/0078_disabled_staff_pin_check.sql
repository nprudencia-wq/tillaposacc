CREATE OR REPLACE FUNCTION public.revoked_offline_staff(p_ids uuid[])
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(i), '{}') FROM unnest(COALESCE(p_ids, '{}')) AS i
  WHERE auth.uid() IS NOT NULL AND public.current_store_id() IS NOT NULL
    AND cardinality(p_ids) <= 200
    AND (
      NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = i)
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = i AND p.store_id = public.current_store_id() AND p.active = false)
    );
$$;
REVOKE ALL ON FUNCTION public.revoked_offline_staff(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoked_offline_staff(uuid[]) TO authenticated;