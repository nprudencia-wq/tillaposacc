CREATE OR REPLACE FUNCTION public.delete_supplier(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_name text;
BEGIN
 IF NOT public.can_manage_stock(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 SELECT name INTO v_name FROM suppliers WHERE id=p_id AND store_id=public.current_store_id() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Supplier not found'; END IF;
 IF EXISTS(SELECT 1 FROM grns WHERE supplier_id=p_id) OR EXISTS(SELECT 1 FROM supplier_payments WHERE supplier_id=p_id) OR EXISTS(SELECT 1 FROM supplier_returns WHERE supplier_id=p_id) THEN RAISE EXCEPTION 'This supplier has transaction history and cannot be deleted. Edit its details instead.'; END IF;
 DELETE FROM suppliers WHERE id=p_id;
 INSERT INTO activity_log(user_id, action, details, store_id) VALUES (auth.uid(), 'supplier_deleted', left(coalesce(v_name,'')||' ('||p_id::text||')',200), public.current_store_id());
END $function$;