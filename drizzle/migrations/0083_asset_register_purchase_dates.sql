CREATE TABLE public.asset_register (
 store_id uuid NOT NULL DEFAULT public.current_store_id() REFERENCES public.stores(id),
 account_code text NOT NULL,
 purchase_date date,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,account_code),
 FOREIGN KEY(store_id,account_code) REFERENCES public.gl_accounts(store_id,code)
);
GRANT SELECT ON public.asset_register TO authenticated;
GRANT ALL ON public.asset_register TO service_role;
ALTER TABLE public.asset_register ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accounting staff read their asset register" ON public.asset_register FOR SELECT TO authenticated USING(store_id=public.current_store_id() AND public.can_view_accounts(auth.uid()));
CREATE TRIGGER asset_register_ownership BEFORE INSERT OR UPDATE ON public.asset_register FOR EACH ROW EXECUTE FUNCTION public.assign_store_ownership();
CREATE OR REPLACE FUNCTION public.save_asset_purchase_date(p_code text,p_purchase_date date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s uuid:=public.current_store_id();
BEGIN
 IF s IS NULL OR NOT public.can_view_accounts(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.gl_accounts WHERE store_id=s AND code=p_code AND type='asset' AND NOT system AND code NOT LIKE '%-AD') THEN RAISE EXCEPTION 'Asset account not found in your store'; END IF;
 INSERT INTO public.asset_register(store_id,account_code,purchase_date) VALUES(s,p_code,p_purchase_date)
 ON CONFLICT(store_id,account_code) DO UPDATE SET purchase_date=excluded.purchase_date,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.save_asset_purchase_date(text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_asset_purchase_date(text,date) TO authenticated;
COMMENT ON TABLE public.asset_register IS 'Asset account purchase metadata only; costs and book values derive from the ledger, rates and first-use dates from asset_depreciation.';