CREATE TABLE public.stores (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL,
 is_vendor_store boolean NOT NULL DEFAULT false,
 billing_exempt boolean NOT NULL DEFAULT false,
 trial_started_at timestamptz,
 trial_ends_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX one_vendor_store ON public.stores(is_vendor_store) WHERE is_vendor_store;
CREATE TABLE public.store_memberships (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 store_id uuid NOT NULL REFERENCES public.stores(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.store_memberships TO authenticated;
GRANT ALL ON public.store_memberships TO service_role;
ALTER TABLE public.store_memberships ENABLE ROW LEVEL SECURITY;
CREATE INDEX store_memberships_store_id ON public.store_memberships(store_id);
INSERT INTO public.stores(name,is_vendor_store,billing_exempt)
 SELECT business_name,true,true FROM public.settings WHERE id=1;
INSERT INTO public.store_memberships(user_id,store_id)
 SELECT p.id,s.id FROM public.profiles p CROSS JOIN public.stores s WHERE s.is_vendor_store;
CREATE POLICY read_own_membership ON public.store_memberships FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY read_own_store ON public.stores FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.store_memberships m WHERE m.user_id=auth.uid() AND m.store_id=stores.id));
ALTER TABLE public.settings ADD COLUMN store_id uuid REFERENCES public.stores(id);
UPDATE public.settings SET store_id=(SELECT id FROM public.stores WHERE is_vendor_store) WHERE id=1;
CREATE OR REPLACE FUNCTION public.protect_vendor_store_billing() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.stores s WHERE s.id=OLD.store_id AND s.is_vendor_store) THEN
  IF NEW.store_id IS DISTINCT FROM OLD.store_id OR NEW.billing_exempt IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'The vendor store is permanently free for every till';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_vendor_store_billing BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.protect_vendor_store_billing();
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text := NEW.raw_app_meta_data->>'initial_role'; v_store uuid;
BEGIN
 -- Only trusted administrative account creation may enrol staff. Public signup metadata cannot grant membership.
 IF v_role IS NULL OR v_role NOT IN ('admin','owner','manager','supervisor','cashier','stock_controller','accountant') THEN
  RAISE EXCEPTION 'Public staff registration is closed. Ask your store owner for an account.';
 END IF;
 SELECT id INTO v_store FROM public.stores WHERE is_vendor_store;
 IF v_store IS NULL THEN RAISE EXCEPTION 'Store setup is incomplete'; END IF;
 INSERT INTO public.profiles(id,full_name,username) VALUES(NEW.id,coalesce(nullif(NEW.raw_user_meta_data->>'full_name',''),split_part(NEW.email,'@',1)),lower(coalesce(nullif(NEW.raw_user_meta_data->>'username',''),split_part(NEW.email,'@',1))));
 INSERT INTO public.store_memberships(user_id,store_id) VALUES(NEW.id,v_store);
 INSERT INTO public.user_roles(user_id,role) VALUES(NEW.id,v_role::public.app_role);
 RETURN NEW;
END $$;
COMMENT ON TABLE public.stores IS 'Phase 1 safety foundation. Do not provision customer stores until all legacy business tables, privileged functions, storage and offline state have tenant isolation.';
COMMENT ON TABLE public.store_memberships IS 'Trusted store assignment; clients cannot assign or change membership.';