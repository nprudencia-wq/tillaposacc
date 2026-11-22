ALTER TABLE public.sales ADD COLUMN register_id text;
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.complete_offline_sale_v2(text,jsonb,jsonb,numeric,text,timestamptz,uuid,uuid)'::regprocedure);
 IF position('insert into _offline_lines values (p.id, p.name, v_qty, v_price, v_cost);' in d)=0 THEN RAISE EXCEPTION 'Sale function changed; review required'; END IF;
 d:=replace(d,'insert into _offline_lines values (p.id, p.name, v_qty, v_price, v_cost);', E'IF coalesce((it->>''override'')::boolean,false) THEN\n IF NOT public.has_permission(v_uid,''override_price'') THEN RAISE EXCEPTION ''Price override permission required''; END IF;\n v_price:=(it->>''unit_price'')::numeric;\n IF v_price IS NULL OR v_price<0 OR v_price::text IN (''NaN'',''Infinity'',''-Infinity'') THEN RAISE EXCEPTION ''Invalid override price''; END IF;\n END IF;\n insert into _offline_lines values (p.id, p.name, v_qty, v_price, v_cost);');
 EXECUTE d;
END $$;
CREATE FUNCTION public.complete_register_sale(p_register_id text,p_device_id uuid,p_client_ref text,p_items jsonb,p_payments jsonb,p_discount numeric,p_currency text,p_sold_at timestamptz,p_shift uuid,p_customer uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s uuid:=public.current_store_id(); result jsonb; BEGIN
 IF NOT public.is_staff(auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.register_heartbeats WHERE store_id=s AND register_id=p_register_id AND device_id=p_device_id) THEN RAISE EXCEPTION 'Assigned register required'; END IF;
 result:=public.complete_offline_sale_v2(p_client_ref,p_items,p_payments,p_discount,p_currency,p_sold_at,p_shift,p_customer);
 UPDATE public.sales SET register_id=p_register_id WHERE id=(result->>'id')::uuid AND store_id=s AND cashier_id=auth.uid() AND register_id IS NULL;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.complete_register_sale(text,uuid,text,jsonb,jsonb,numeric,text,timestamptz,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_register_sale(text,uuid,text,jsonb,jsonb,numeric,text,timestamptz,uuid,uuid) TO authenticated;