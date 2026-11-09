CREATE OR REPLACE FUNCTION public.discard_trial_store(p_store uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id=p_store AND NOT is_vendor_store AND created_at > now()-interval '10 minutes')
     OR EXISTS (SELECT 1 FROM public.store_memberships WHERE store_id=p_store) THEN
    RAISE EXCEPTION 'Only a brand-new unclaimed trial store can be discarded';
  END IF;
  DELETE FROM public.activity_log WHERE store_id=p_store;
  DELETE FROM public.stock_movements WHERE store_id=p_store;
  DELETE FROM public.price_history WHERE store_id=p_store;
  DELETE FROM public.branch_stock WHERE store_id=p_store;
  DELETE FROM public.products WHERE store_id=p_store;
  DELETE FROM public.categories WHERE store_id=p_store;
  DELETE FROM public.branches WHERE store_id=p_store;
  DELETE FROM public.payment_types WHERE store_id=p_store;
  DELETE FROM public.rate_history WHERE store_id=p_store;
  DELETE FROM public.settings WHERE store_id=p_store;
  DELETE FROM public.gl_accounts WHERE store_id=p_store;
  DELETE FROM public.document_counters WHERE store_id=p_store;
  DELETE FROM public.stores WHERE id=p_store;
END $$;
REVOKE ALL ON FUNCTION public.discard_trial_store(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discard_trial_store(uuid) TO service_role;