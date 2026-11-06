CREATE OR REPLACE FUNCTION public.can_manage_store_member(p_target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.can_manage_staff(auth.uid()) AND EXISTS(
  SELECT 1 FROM public.store_memberships caller JOIN public.store_memberships target ON target.store_id=caller.store_id
  WHERE caller.user_id=auth.uid() AND target.user_id=p_target
 );
$$;
REVOKE ALL ON FUNCTION public.can_manage_store_member(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_store_member(uuid) TO authenticated,service_role;