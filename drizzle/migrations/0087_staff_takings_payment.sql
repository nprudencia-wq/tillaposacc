ALTER TABLE public.payment_types ADD COLUMN IF NOT EXISTS is_staff boolean NOT NULL DEFAULT false;
INSERT INTO public.gl_accounts(store_id,code,name,type,system) SELECT id,'1160','Staff takings (staff debtors)','asset',true FROM public.stores ON CONFLICT DO NOTHING;
INSERT INTO public.payment_types(store_id,code,name,is_cash,is_account,is_staff,sort_order) SELECT id,'staff_takings','Staff takings',false,false,true,90 FROM public.stores s WHERE NOT EXISTS(SELECT 1 FROM public.payment_types p WHERE p.store_id=s.id AND p.code='staff_takings');
CREATE OR REPLACE FUNCTION public.add_staff_takings_defaults() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.gl_accounts(store_id,code,name,type,system) VALUES(NEW.id,'1160','Staff takings (staff debtors)','asset',true) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stores_staff_takings_account ON public.stores;
CREATE TRIGGER stores_staff_takings_account AFTER INSERT ON public.stores FOR EACH ROW EXECUTE FUNCTION public.add_staff_takings_defaults();
REVOKE EXECUTE ON FUNCTION public.add_staff_takings_defaults() FROM public, anon, authenticated;
CREATE OR REPLACE FUNCTION public.gl_method_account(p text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN public.is_account_method(p) THEN '1100'
    WHEN coalesce((SELECT is_staff FROM public.payment_types WHERE code=p AND store_id=public.current_store_id()),false) THEN '1160'
    WHEN public.is_cash_method(p) THEN '1000' ELSE '1010' END
$$;