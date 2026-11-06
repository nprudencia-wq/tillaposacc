CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text:=NEW.raw_app_meta_data->>'initial_role'; sid uuid;
BEGIN
 -- Auth may write app metadata after the initial insert; provision once the trusted role is present.
 IF v_role IS NULL THEN
  IF TG_OP='INSERT' THEN RETURN NEW; END IF;
  RETURN NEW;
 END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.id) THEN RETURN NEW; END IF;
 IF v_role NOT IN ('admin','owner','manager','supervisor','cashier','stock_controller','accountant') THEN RAISE EXCEPTION 'Public staff registration is closed'; END IF;
 sid:=nullif(NEW.raw_app_meta_data->>'store_id','')::uuid;
 IF sid IS NULL THEN SELECT id INTO sid FROM public.stores WHERE is_vendor_store; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.stores WHERE id=sid) THEN RAISE EXCEPTION 'Store not found'; END IF;
 PERFORM set_config('app.provisioning_user',NEW.id::text,true);
 INSERT INTO public.profiles(id,full_name,username,store_id) VALUES(NEW.id,coalesce(nullif(NEW.raw_user_meta_data->>'full_name',''),split_part(NEW.email,'@',1)),lower(coalesce(nullif(NEW.raw_user_meta_data->>'username',''),split_part(NEW.email,'@',1))),sid);
 INSERT INTO public.store_memberships(user_id,store_id) VALUES(NEW.id,sid);
 INSERT INTO public.user_roles(user_id,role,store_id) VALUES(NEW.id,v_role::public.app_role,sid);
 PERFORM set_config('app.provisioning_user','',true);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_app_meta_updated ON auth.users;
CREATE TRIGGER on_auth_user_app_meta_updated AFTER UPDATE OF raw_app_meta_data ON auth.users FOR EACH ROW WHEN (NEW.raw_app_meta_data->>'initial_role' IS NOT NULL) EXECUTE FUNCTION public.handle_new_user();