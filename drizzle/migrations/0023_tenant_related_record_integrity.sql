CREATE OR REPLACE FUNCTION public.check_store_references() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE edge record; ref_value text; ref_store uuid; row_data jsonb:=to_jsonb(NEW);
BEGIN
 FOR edge IN SELECT * FROM (VALUES
 ('products','category_id','categories','id'),('categories','parent_id','categories','id'),
 ('branch_stock','branch_id','branches','id'),('branch_stock','product_id','products','id'),
 ('stock_movements','product_id','products','id'),('stock_movements','branch_id','branches','id'),
 ('stock_transfers','from_branch','branches','id'),('stock_transfers','to_branch','branches','id'),
 ('sales','customer_id','customers','id'),('sales','shift_id','cashier_shifts','id'),
 ('sale_items','sale_id','sales','id'),('sale_items','product_id','products','id'),('sale_payments','sale_id','sales','id'),
 ('refunds','sale_id','sales','id'),('refunds','shift_id','cashier_shifts','id'),
 ('grns','supplier_id','suppliers','id'),('grn_items','grn_id','grns','id'),('grn_items','product_id','products','id'),
 ('supplier_payments','supplier_id','suppliers','id'),('supplier_returns','supplier_id','suppliers','id'),
 ('customer_payments','customer_id','customers','id'),('customer_payments','shift_id','cashier_shifts','id'),
 ('customer_adjustments','customer_id','customers','id'),('shift_cash_movements','shift_id','cashier_shifts','id'),
 ('stocktakes','category_id','categories','id'),('stocktake_items','stocktake_id','stocktakes','id'),('stocktake_items','product_id','products','id'),
 ('price_history','product_id','products','id'),('journal_lines','entry_id','journal_entries','id'),('journal_lines','account_code','gl_accounts','code'),
 ('user_roles','user_id','profiles','id'),('user_permissions','user_id','profiles','id'),('staff_pins','user_id','profiles','id')
 ) AS refs(child,col,parent,parent_key) WHERE child=TG_TABLE_NAME LOOP
  ref_value:=row_data->>edge.col;
  IF ref_value IS NOT NULL THEN
   EXECUTE format('SELECT store_id FROM public.%I WHERE %I::text=$1',edge.parent,edge.parent_key) INTO ref_store USING ref_value;
   IF ref_store IS DISTINCT FROM NEW.store_id THEN RAISE EXCEPTION 'Referenced record does not belong to this store'; END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['products','categories','branch_stock','stock_movements','stock_transfers','sales','sale_items','sale_payments','refunds','grns','grn_items','supplier_payments','supplier_returns','customer_payments','customer_adjustments','shift_cash_movements','stocktakes','stocktake_items','price_history','journal_lines','user_roles','user_permissions','staff_pins'] LOOP
 EXECUTE format('CREATE TRIGGER z_store_reference_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.check_store_references()',t);
 END LOOP;
END $$;