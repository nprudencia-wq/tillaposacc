DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE OR REPLACE FUNCTION public.guard_profile_protected_fields() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND (NEW.active IS DISTINCT FROM OLD.active OR NEW.username IS DISTINCT FROM OLD.username OR NEW.store_id IS DISTINCT FROM OLD.store_id OR NEW.id IS DISTINCT FROM OLD.id) THEN
    RAISE EXCEPTION 'Protected profile fields can only be changed by a manager';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profile_protected_fields_guard BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_protected_fields();