CREATE OR REPLACE FUNCTION public.post_grn_draft(p_id uuid, p_version integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE d public.grn_drafts; result jsonb; items jsonb; v_date date; v_today date := (now() AT TIME ZONE 'Africa/Harare')::date; v_at timestamptz; BEGIN IF public.current_store_id() IS NULL OR NOT public.can_manage_stock(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF; SELECT * INTO d FROM public.grn_drafts WHERE id=p_id AND store_id=public.current_store_id() FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF; IF d.posted_grn_id IS NOT NULL THEN SELECT jsonb_build_object('id',id,'grn_number',grn_number) INTO result FROM public.grns WHERE id=d.posted_grn_id AND store_id=d.store_id; RETURN result; END IF; IF d.version<>p_version THEN RAISE EXCEPTION 'Draft changed. Reopen and review it again.'; END IF;
v_date := coalesce(nullif(d.payload->>'delivery_date','')::date, v_today);
IF v_date > v_today THEN RAISE EXCEPTION 'Delivery date cannot be in the future'; END IF;
IF v_date < v_today - 366 THEN RAISE EXCEPTION 'Delivery date cannot be more than a year ago'; END IF;
SELECT jsonb_agg(jsonb_build_object('product_id',x->>'product_id','quantity',(x->>'quantity')::numeric,'unit_cost',(x->>'unit_cost')::numeric)) INTO items FROM jsonb_array_elements(d.payload->'lines') x WHERE coalesce(x->>'product_id','')<>'' OR coalesce(x->>'quantity','')<>'' OR coalesce(x->>'unit_cost','')<>'';
result:=public.receive_goods_currency((d.payload->>'supplier')::uuid,d.payload->>'invoice',items,coalesce(nullif(d.payload->>'paid',''),'0')::numeric,d.payload->>'note',d.payload->>'currency',(d.payload->>'rate')::numeric,d.payload->>'method'); IF (result->>'id') IS NULL THEN RAISE EXCEPTION 'Receipt could not be linked'; END IF;
IF v_date < v_today THEN
  v_at := (v_date::timestamp + time '12:00') AT TIME ZONE 'Africa/Harare';
  UPDATE public.grns SET created_at=v_at WHERE id=(result->>'id')::uuid AND store_id=d.store_id;
  UPDATE public.stock_movements SET created_at=v_at WHERE store_id=d.store_id AND type='purchase' AND reference=result->>'grn_number';
END IF;
UPDATE public.grn_drafts SET posted_grn_id=(result->>'id')::uuid,version=version+1,updated_at=now() WHERE id=d.id; RETURN result; END $function$;