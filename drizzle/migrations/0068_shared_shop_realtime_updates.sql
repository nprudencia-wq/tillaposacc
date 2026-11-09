DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['products','categories','stock_movements','branches','branch_stock','stock_transfers','stocktakes','stocktake_items','price_history','sales','sale_items','sale_payments','refunds','sales_documents','invoice_payment_allocations','customers','customer_payments','customer_adjustments','suppliers','grns','grn_items','grn_drafts','supplier_payments','supplier_returns','cashier_shifts','shift_cash_movements','daily_settlements','profiles','user_roles','user_permissions','time_clock','activity_log','settings','currency_confirmations','rate_history','payment_types','stores','store_memberships','subscription_payments','expenses','gl_accounts','journal_entries','journal_lines','zimra_config','zimra_fiscal_days','zimra_receipts'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',t);
    END IF;
  END LOOP;
END $$;