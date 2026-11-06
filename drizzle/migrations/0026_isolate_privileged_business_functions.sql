CREATE ROLE tilla_store_operations NOLOGIN NOINHERIT NOBYPASSRLS;
GRANT tilla_store_operations TO postgres;
GRANT USAGE ON SCHEMA public,extensions TO tilla_store_operations;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO tilla_store_operations;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO tilla_store_operations;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO tilla_store_operations;
GRANT CREATE ON SCHEMA public TO tilla_store_operations;
DO $$ DECLARE t text; f record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('stores','store_memberships') LOOP
  EXECUTE format('CREATE POLICY operations_store_access ON public.%I FOR ALL TO tilla_store_operations USING(store_id=public.current_store_id()) WITH CHECK(store_id=public.current_store_id())',t);
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY(ARRAY['adjust_customer_balance','adjust_stock','clock_in','clock_out','close_shift','complete_offline_sale','complete_sale','customer_balance','finish_stocktake','gl_lines','pay_supplier','post_expense','post_journal','receive_customer_payment','receive_goods','receive_goods_currency','record_cash_movement','record_count','refund_sale','return_to_supplier','save_branch','save_gl_account','save_inventory_product','set_staff_pin','set_user_active','set_user_permission','set_user_role','shift_summary','start_stocktake','submit_subscription_payment','transfer_stock','verify_payment']) LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO tilla_store_operations',f.signature); END LOOP;
END $$;
REVOKE CREATE ON SCHEMA public FROM tilla_store_operations;
COMMENT ON ROLE tilla_store_operations IS 'Non-login non-bypass owner of business RPCs; policies permit only the authenticated current store.';