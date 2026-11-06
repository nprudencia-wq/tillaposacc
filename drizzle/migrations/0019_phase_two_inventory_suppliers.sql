ALTER TABLE public.grns ADD COLUMN currency text NOT NULL DEFAULT 'USD', ADD COLUMN exchange_rate numeric NOT NULL DEFAULT 1, ADD COLUMN original_total numeric NOT NULL DEFAULT 0;
UPDATE public.grns SET original_total=total;
ALTER TABLE public.grn_items ADD COLUMN original_unit_cost numeric NOT NULL DEFAULT 0;
UPDATE public.grn_items SET original_unit_cost=unit_cost;
CREATE OR REPLACE FUNCTION public.save_inventory_product(p_id uuid, p_fields jsonb, p_stock numeric, p_expected_stock numeric, p_reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_stock numeric; v_name text; v_cost numeric;
BEGIN
 IF NOT public.can_manage_stock(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 v_name := trim(p_fields->>'name');
 IF v_name IS NULL OR v_name='' THEN RAISE EXCEPTION 'Name is required'; END IF;
 IF p_stock IS NULL OR p_stock<0 OR p_stock::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Stock must be zero or positive'; END IF;
 FOR v_cost IN SELECT (p_fields->>k)::numeric FROM unnest(ARRAY['cost_price','selling_price','wholesale_price','min_stock','max_stock']) k LOOP
  IF v_cost IS NULL OR v_cost<0 OR v_cost::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Prices and stock limits must be zero or positive'; END IF;
 END LOOP;
 IF p_id IS NULL THEN
  INSERT INTO products(name,sku,barcode,description,category_id,image_url,cost_price,selling_price,wholesale_price,min_stock,max_stock,active)
  VALUES(v_name,nullif(p_fields->>'sku',''),nullif(p_fields->>'barcode',''),p_fields->>'description',nullif(p_fields->>'category_id','')::uuid,p_fields->>'image_url',(p_fields->>'cost_price')::numeric,(p_fields->>'selling_price')::numeric,(p_fields->>'wholesale_price')::numeric,(p_fields->>'min_stock')::numeric,(p_fields->>'max_stock')::numeric,coalesce((p_fields->>'active')::boolean,true)) RETURNING id INTO v_id;
  IF p_stock>0 THEN PERFORM public.adjust_stock(v_id,p_stock,'opening','Opening stock'); END IF;
 ELSE
  SELECT stock INTO v_stock FROM products WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF v_stock IS DISTINCT FROM p_expected_stock THEN RAISE EXCEPTION 'Stock changed since this product was opened. Reopen it before saving.'; END IF;
  IF p_stock<>v_stock AND coalesce(trim(p_reason),'')='' THEN RAISE EXCEPTION 'Enter a reason for the stock correction'; END IF;
  UPDATE products SET name=v_name,sku=nullif(p_fields->>'sku',''),barcode=nullif(p_fields->>'barcode',''),description=p_fields->>'description',category_id=nullif(p_fields->>'category_id','')::uuid,image_url=p_fields->>'image_url',cost_price=(p_fields->>'cost_price')::numeric,selling_price=(p_fields->>'selling_price')::numeric,wholesale_price=(p_fields->>'wholesale_price')::numeric,min_stock=(p_fields->>'min_stock')::numeric,max_stock=(p_fields->>'max_stock')::numeric,active=coalesce((p_fields->>'active')::boolean,true) WHERE id=p_id;
  v_id:=p_id;
  IF p_stock<>v_stock THEN PERFORM public.adjust_stock(v_id,p_stock-v_stock,'adjustment',p_reason); END IF;
 END IF;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.save_inventory_product(uuid,jsonb,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_inventory_product(uuid,jsonb,numeric,numeric,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.delete_supplier(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_manage_stock(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 PERFORM id FROM suppliers WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Supplier not found'; END IF;
 IF EXISTS(SELECT 1 FROM grns WHERE supplier_id=p_id) OR EXISTS(SELECT 1 FROM supplier_payments WHERE supplier_id=p_id) OR EXISTS(SELECT 1 FROM supplier_returns WHERE supplier_id=p_id) THEN RAISE EXCEPTION 'This supplier has transaction history and cannot be deleted. Edit its details instead.'; END IF;
 DELETE FROM suppliers WHERE id=p_id;
 PERFORM public.log_event('supplier_deleted',p_id::text);
END $$;
REVOKE ALL ON FUNCTION public.delete_supplier(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_supplier(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.receive_goods_currency(p_supplier uuid,p_invoice text,p_items jsonb,p_paid numeric,p_note text,p_currency text,p_rate numeric,p_method text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_items jsonb; v_result jsonb; v_total numeric; v_id uuid; it jsonb;
BEGIN
 IF NOT public.can_manage_stock(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 IF p_currency NOT IN ('USD','ZiG','ZAR') OR p_currency IS NULL THEN RAISE EXCEPTION 'Invalid currency'; END IF;
 IF p_rate IS NULL OR p_rate<=0 OR p_rate::text IN ('NaN','Infinity','-Infinity') OR (p_currency='USD' AND p_rate<>1) THEN RAISE EXCEPTION 'Enter a positive exchange rate (USD must be 1)'; END IF;
 IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' THEN RAISE EXCEPTION 'Add receipt lines'; END IF;
 IF jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'Add receipt lines'; END IF;
 FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
  IF (it->>'product_id') IS NULL OR (it->>'quantity') IS NULL OR (it->>'unit_cost') IS NULL OR (it->>'quantity')::numeric<=0 OR (it->>'unit_cost')::numeric<0 OR (it->>'quantity')::numeric::text IN ('NaN','Infinity','-Infinity') OR (it->>'unit_cost')::numeric::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Complete every quantity and cost'; END IF;
 END LOOP;
 SELECT sum(round((x->>'quantity')::numeric*(x->>'unit_cost')::numeric,2)),jsonb_agg(jsonb_build_object('product_id',x->>'product_id','quantity',(x->>'quantity')::numeric,'unit_cost',(x->>'unit_cost')::numeric/p_rate)) INTO v_total,v_items FROM jsonb_array_elements(p_items) x;
 IF p_paid IS NULL OR p_paid<0 OR p_paid>v_total OR p_paid::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Payment must be between zero and the invoice total'; END IF;
 IF p_paid>0 AND NOT EXISTS(SELECT 1 FROM payment_types WHERE code=p_method AND active AND NOT is_account) THEN RAISE EXCEPTION 'Choose an active payment type'; END IF;
 v_result:=public.receive_goods(p_supplier,p_invoice,v_items,0,p_note);
 v_id:=(v_result->>'id')::uuid;
 UPDATE grns SET currency=p_currency,exchange_rate=p_rate,original_total=v_total WHERE id=v_id;
 UPDATE grn_items SET original_unit_cost=unit_cost*p_rate WHERE grn_id=v_id;
 IF p_paid>0 THEN INSERT INTO supplier_payments(supplier_id,amount,method,reference,paid_by) VALUES(p_supplier,round(p_paid/p_rate,2),p_method,v_result->>'grn_number',auth.uid()); END IF;
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.receive_goods_currency(uuid,text,jsonb,numeric,text,text,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.receive_goods_currency(uuid,text,jsonb,numeric,text,text,numeric,text) TO authenticated;