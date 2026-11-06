CREATE OR REPLACE FUNCTION public.current_store_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT m.store_id FROM public.store_memberships m JOIN public.profiles p ON p.id=m.user_id WHERE m.user_id=auth.uid() AND p.active $$;
REVOKE ALL ON FUNCTION public.current_store_id() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_store_id() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.assign_store_ownership() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE expected uuid := public.current_store_id();
BEGIN
 IF TG_OP='UPDATE' AND NEW.store_id IS DISTINCT FROM OLD.store_id THEN RAISE EXCEPTION 'Store ownership cannot be changed'; END IF;
 IF auth.uid() IS NOT NULL THEN
  IF expected IS NULL THEN RAISE EXCEPTION 'No active store membership'; END IF;
  IF NEW.store_id IS NULL THEN NEW.store_id:=expected; END IF;
  IF NEW.store_id IS DISTINCT FROM expected THEN RAISE EXCEPTION 'This record belongs to another store'; END IF;
 END IF;
 IF NEW.store_id IS NULL THEN RAISE EXCEPTION 'Store ownership is required'; END IF;
 RETURN NEW;
END $$;
DO $$
DECLARE t text; vendor uuid;
BEGIN
 SELECT id INTO STRICT vendor FROM public.stores WHERE is_vendor_store;
 FOREACH t IN ARRAY ARRAY['profiles','user_roles','user_permissions','activity_log','branches','branch_stock','cashier_shifts','categories','customer_adjustments','customer_payments','customers','expenses','gl_accounts','grn_items','grns','journal_entries','journal_lines','payment_types','price_history','products','rate_history','refunds','sale_items','sale_payments','sales','shift_cash_movements','staff_pins','stock_movements','stock_transfers','stocktake_items','stocktakes','subscription_payments','supplier_payments','supplier_returns','suppliers','time_clock'] LOOP
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN store_id uuid REFERENCES public.stores(id)',t);
  EXECUTE format('UPDATE public.%I SET store_id=$1',t) USING vendor;
  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN store_id SET DEFAULT public.current_store_id()',t);
  EXECUTE format('CREATE INDEX %I ON public.%I(store_id)',t||'_store_scope_idx',t);
  EXECUTE format('CREATE POLICY store_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(store_id=public.current_store_id()) WITH CHECK(store_id=public.current_store_id())',t);
  EXECUTE format('CREATE TRIGGER store_ownership_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.assign_store_ownership()',t);
 END LOOP;
END $$;
CREATE POLICY store_boundary ON public.settings AS RESTRICTIVE FOR ALL TO authenticated USING(store_id=public.current_store_id()) WITH CHECK(store_id=public.current_store_id());
CREATE TRIGGER store_ownership_guard BEFORE INSERT OR UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.assign_store_ownership();
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id=r.user_id JOIN public.store_memberships m ON m.user_id=p.id WHERE r.user_id=_user_id AND p.active AND m.store_id=r.store_id AND (auth.uid() IS NULL OR m.store_id=public.current_store_id())) $$;
COMMENT ON FUNCTION public.assign_store_ownership() IS 'Defence in depth for writes; security-definer read paths and cross-record references still require explicit tenant auditing before onboarding other stores.';