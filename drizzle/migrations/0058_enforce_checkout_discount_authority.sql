DO $migration$
DECLARE fn regprocedure; definition text; marker text := 'if not public.is_staff(v_uid) then raise exception ''Not authorised''; end if;';
BEGIN
  FOREACH fn IN ARRAY ARRAY['public.complete_sale(jsonb,jsonb,numeric,text,uuid)'::regprocedure, 'public.complete_offline_sale(text,jsonb,jsonb,numeric,text,timestamp with time zone,uuid)'::regprocedure]
  LOOP
    definition := pg_get_functiondef(fn);
    IF position(marker in definition) = 0 THEN RAISE EXCEPTION 'Missing checkout authorization insertion point: %', fn; END IF;
    definition := replace(definition, marker, marker || E'\n  IF p_discount IS NULL OR p_discount::text IN (''NaN'',''Infinity'',''-Infinity'') OR p_discount < 0 THEN RAISE EXCEPTION ''Invalid discount''; END IF;\n  IF p_discount > 0 AND NOT public.has_permission(v_uid, ''give_discount'') THEN RAISE EXCEPTION ''You are not allowed to give discounts''; END IF;');
    EXECUTE definition;
  END LOOP;
  definition := pg_get_functiondef('public.role_allows(uuid,text)'::regprocedure);
  IF position('when ''give_discount'' then array[''admin'',''owner'',''manager'',''supervisor'',''cashier'']' in definition) = 0 THEN RAISE EXCEPTION 'Missing discount role default insertion point'; END IF;
  EXECUTE replace(definition, 'when ''give_discount'' then array[''admin'',''owner'',''manager'',''supervisor'',''cashier'']', 'when ''give_discount'' then array[''admin'',''owner'',''manager'',''supervisor'']');
END $migration$;