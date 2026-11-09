CREATE OR REPLACE FUNCTION public.create_trial_store(p_name text, p_phone text DEFAULT '', p_email text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid; cat_bakery uuid; cat_dairy uuid; cat_grocery uuid; r record; pid uuid;
BEGIN
  IF coalesce(trim(p_name),'')='' OR length(trim(p_name))>80 THEN RAISE EXCEPTION 'Enter your shop name'; END IF;
  INSERT INTO public.stores(name,is_vendor_store,billing_exempt,trial_started_at,trial_ends_at)
  VALUES(trim(p_name),false,false,now(),now()+interval '14 days') RETURNING id INTO sid;
  INSERT INTO public.settings(store_id,business_name,phone,email,paid_until,grace_days,till_count,billing_exempt,vendor_name,vendor_pay_details)
  SELECT sid,trim(p_name),left(coalesce(p_phone,''),40),left(coalesce(p_email,''),120),current_date+13,0,1,false,v.vendor_name,v.vendor_pay_details
  FROM public.settings v JOIN public.stores s ON s.id=v.store_id AND s.is_vendor_store;
  INSERT INTO public.payment_types(store_id,code,name,is_cash,is_account,sort_order) VALUES
    (sid,'cash','Cash',true,false,1),(sid,'mobile_money','Ecocash',false,false,2),(sid,'card','Card / Swipe',false,false,3),(sid,'account','On account (credit)',false,true,4);
  INSERT INTO public.branches(store_id,name,is_main,active) VALUES(sid,'Main shop',true,true);
  INSERT INTO public.categories(store_id,name) VALUES(sid,'Bakery') RETURNING id INTO cat_bakery;
  INSERT INTO public.categories(store_id,name) VALUES(sid,'Dairy') RETURNING id INTO cat_dairy;
  INSERT INTO public.categories(store_id,name) VALUES(sid,'Groceries') RETURNING id INTO cat_grocery;
  FOR r IN SELECT * FROM (VALUES ('Bread',cat_bakery,0.70,1.00),('Milk 1L',cat_dairy,0.90,1.30),('Cooking Oil 2L',cat_grocery,3.20,4.50)) v(n,c,cost,price) LOOP
    INSERT INTO public.products(store_id,name,category_id,cost_price,selling_price,wholesale_price,stock,min_stock,max_stock,active)
    VALUES(sid,r.n,r.c,r.cost,r.price,r.price,20,5,100,true) RETURNING id INTO pid;
    INSERT INTO public.stock_movements(store_id,product_id,type,quantity,balance_after,note) VALUES(sid,pid,'opening',20,20,'Starter catalog');
  END LOOP;
  RETURN sid;
END $$;
REVOKE ALL ON FUNCTION public.create_trial_store(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_trial_store(text,text,text) TO service_role;