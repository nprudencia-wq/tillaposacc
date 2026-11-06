CREATE OR REPLACE FUNCTION public.log_event(p_action text, p_details text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF p_action NOT IN ('login','logout','pin_login','drawer_open') THEN RAISE EXCEPTION 'Unknown event'; END IF;
  INSERT INTO activity_log(user_id, action, details) VALUES (auth.uid(), p_action, left(p_details, 200));
END $function$;