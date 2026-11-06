CREATE OR REPLACE FUNCTION public.assign_store_ownership() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE expected uuid;
BEGIN
 IF TG_OP='UPDATE' AND NEW.store_id IS DISTINCT FROM OLD.store_id THEN RAISE EXCEPTION 'Store ownership cannot be changed'; END IF;
 -- Trusted staff provisioning from handle_new_user: the new account has no membership yet.
 IF TG_OP='INSERT' AND current_setting('app.provisioning_user',true) IS NOT NULL AND current_setting('app.provisioning_user',true)<>'' AND NEW.store_id IS NOT NULL THEN RETURN NEW; END IF;
 expected := public.current_store_id();
 IF auth.uid() IS NOT NULL THEN
  IF expected IS NULL THEN RAISE EXCEPTION 'No active store membership'; END IF;
  IF NEW.store_id IS NULL THEN NEW.store_id:=expected; END IF;
  IF NEW.store_id IS DISTINCT FROM expected THEN RAISE EXCEPTION 'This record belongs to another store'; END IF;
 END IF;
 IF NEW.store_id IS NULL THEN RAISE EXCEPTION 'Store ownership is required'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_role text:=NEW.raw_app_meta_data->>'initial_role'; sid uuid; BEGIN IF v_role NOT IN ('admin','owner','manager','supervisor','cashier','stock_controller','accountant') OR v_role IS NULL THEN RAISE EXCEPTION 'Public staff registration is closed'; END IF; sid:=nullif(NEW.raw_app_meta_data->>'store_id','')::uuid; IF sid IS NULL THEN SELECT id INTO sid FROM public.stores WHERE is_vendor_store; END IF; IF NOT EXISTS(SELECT 1 FROM public.stores WHERE id=sid) THEN RAISE EXCEPTION 'Store not found'; END IF; PERFORM set_config('app.provisioning_user',NEW.id::text,true); INSERT INTO public.profiles(id,full_name,username,store_id) VALUES(NEW.id,coalesce(nullif(NEW.raw_user_meta_data->>'full_name',''),split_part(NEW.email,'@',1)),lower(coalesce(nullif(NEW.raw_user_meta_data->>'username',''),split_part(NEW.email,'@',1))),sid); INSERT INTO public.store_memberships(user_id,store_id) VALUES(NEW.id,sid); INSERT INTO public.user_roles(user_id,role,store_id) VALUES(NEW.id,v_role::public.app_role,sid); PERFORM set_config('app.provisioning_user','',true); RETURN NEW; END $$;