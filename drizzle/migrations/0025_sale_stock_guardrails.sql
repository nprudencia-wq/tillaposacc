CREATE OR REPLACE FUNCTION public.prevent_oversold_sale_line() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE available numeric; product_name text; reserved numeric;
BEGIN
 SELECT stock,name INTO available,product_name FROM public.products WHERE id=NEW.product_id AND store_id=NEW.store_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product is unavailable in this store'; END IF;
 IF NEW.quantity IS NULL OR NEW.quantity<=0 THEN RAISE EXCEPTION 'Enter a positive quantity'; END IF;
 SELECT coalesce(sum(quantity),0) INTO reserved FROM public.sale_items WHERE sale_id=NEW.sale_id AND product_id=NEW.product_id;
 -- Every existing sale routine deducts stock after inserting each line. available already reflects prior lines.
 IF available<=0 OR NEW.quantity>available THEN RAISE EXCEPTION 'Cannot sell %: only % available',product_name,available; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_sale_stock_guard BEFORE INSERT ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.prevent_oversold_sale_line();