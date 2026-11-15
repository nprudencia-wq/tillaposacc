CREATE OR REPLACE FUNCTION public.can_refund(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT CASE WHEN auth.uid() IS NOT NULL AND _user_id = auth.uid() THEN public.has_permission(auth.uid(), 'refund') ELSE false END $$;
CREATE OR REPLACE FUNCTION public.can_view_accounts(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT CASE WHEN auth.uid() IS NOT NULL AND _user_id = auth.uid() THEN public.is_staff(auth.uid()) AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','owner','manager','accountant')) ELSE false END $$;
REVOKE ALL ON FUNCTION public.can_refund(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_accounts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_refund(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_accounts(uuid) TO authenticated, service_role;