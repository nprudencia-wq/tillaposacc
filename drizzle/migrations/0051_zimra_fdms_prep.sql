CREATE TABLE public.zimra_config (
 store_id uuid PRIMARY KEY REFERENCES public.stores(id) DEFAULT public.current_store_id(),
 enabled boolean NOT NULL DEFAULT false,
 environment text NOT NULL DEFAULT 'test' CHECK (environment IN ('test','production')),
 device_id text NOT NULL DEFAULT '', device_serial text NOT NULL DEFAULT '', device_model text NOT NULL DEFAULT '', device_version text NOT NULL DEFAULT '',
 taxpayer_name text NOT NULL DEFAULT '', taxpayer_tin text NOT NULL DEFAULT '', vat_number text NOT NULL DEFAULT '', bp_number text NOT NULL DEFAULT '',
 activation_key_set boolean NOT NULL DEFAULT false, certificate_set boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.zimra_config TO authenticated; GRANT ALL ON public.zimra_config TO service_role;
ALTER TABLE public.zimra_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY zimra_config_read ON public.zimra_config FOR SELECT TO authenticated USING (store_id=public.current_store_id() AND public.is_staff(auth.uid()));

CREATE TABLE public.zimra_secrets (store_id uuid PRIMARY KEY REFERENCES public.stores(id), activation_key text, certificate text, private_key text, updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.zimra_secrets TO service_role;
ALTER TABLE public.zimra_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.zimra_fiscal_days (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES public.stores(id) DEFAULT public.current_store_id(),
 day_no integer NOT NULL, status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
 opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz, receipt_counter integer NOT NULL DEFAULT 0,
 opened_by uuid, closed_by uuid, UNIQUE (store_id, day_no));
CREATE UNIQUE INDEX zimra_one_open_day ON public.zimra_fiscal_days(store_id) WHERE status='open';
GRANT SELECT ON public.zimra_fiscal_days TO authenticated; GRANT ALL ON public.zimra_fiscal_days TO service_role;
ALTER TABLE public.zimra_fiscal_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY zimra_days_read ON public.zimra_fiscal_days FOR SELECT TO authenticated USING (store_id=public.current_store_id() AND public.is_staff(auth.uid()));

CREATE TABLE public.zimra_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES public.stores(id),
 sale_id uuid REFERENCES public.sales(id), refund_id uuid REFERENCES public.refunds(id),
 fiscal_day_id uuid NOT NULL REFERENCES public.zimra_fiscal_days(id), day_no integer NOT NULL,
 receipt_counter integer NOT NULL, global_no integer NOT NULL,
 receipt_type text NOT NULL CHECK (receipt_type IN ('FiscalInvoice','CreditNote')),
 currency text NOT NULL, total numeric NOT NULL, tax_amount numeric NOT NULL DEFAULT 0, tax_rate numeric NOT NULL DEFAULT 0,
 receipt_hash text NOT NULL, previous_hash text,
 status text NOT NULL DEFAULT 'awaiting_device' CHECK (status IN ('awaiting_device','queued','submitted','failed')),
 signature text, zimra_receipt_id text, error text, attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz,
 UNIQUE (store_id, global_no), UNIQUE (sale_id), UNIQUE (refund_id));
GRANT SELECT ON public.zimra_receipts TO authenticated; GRANT ALL ON public.zimra_receipts TO service_role;
ALTER TABLE public.zimra_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY zimra_receipts_read ON public.zimra_receipts FOR SELECT TO authenticated USING (store_id=public.current_store_id() AND public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.zimra_record_receipt(p_store uuid, p_sale uuid, p_refund uuid, p_type text, p_currency text, p_total numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg public.zimra_config; d public.zimra_fiscal_days; g integer; prev text; h text; vr numeric; ve boolean; tax numeric;
BEGIN
 SELECT * INTO cfg FROM zimra_config WHERE store_id=p_store;
 IF NOT FOUND OR NOT cfg.enabled THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('zimra:'||p_store));
 SELECT * INTO d FROM zimra_fiscal_days WHERE store_id=p_store AND status='open';
 IF NOT FOUND THEN
  INSERT INTO zimra_fiscal_days(store_id,day_no) VALUES (p_store, coalesce((SELECT max(day_no) FROM zimra_fiscal_days WHERE store_id=p_store),0)+1) RETURNING * INTO d;
 END IF;
 UPDATE zimra_fiscal_days SET receipt_counter=receipt_counter+1 WHERE id=d.id RETURNING * INTO d;
 SELECT coalesce(max(global_no),0)+1 INTO g FROM zimra_receipts WHERE store_id=p_store;
 SELECT receipt_hash INTO prev FROM zimra_receipts WHERE fiscal_day_id=d.id ORDER BY receipt_counter DESC LIMIT 1;
 SELECT vat_rate, vat_enabled INTO vr, ve FROM settings WHERE store_id=p_store;
 tax := CASE WHEN ve THEN round(p_total*vr/(100+vr),2) ELSE 0 END;
 h := encode(sha256(convert_to(concat_ws('|',cfg.device_id,p_type,p_currency,g,to_char(now() AT TIME ZONE 'Africa/Harare','YYYY-MM-DD"T"HH24:MI:SS'),round(p_total*100)::bigint,round(tax*100)::bigint,coalesce(prev,'')),'UTF8')),'hex');
 INSERT INTO zimra_receipts(store_id,sale_id,refund_id,fiscal_day_id,day_no,receipt_counter,global_no,receipt_type,currency,total,tax_amount,tax_rate,receipt_hash,previous_hash,status)
 VALUES (p_store,p_sale,p_refund,d.id,d.day_no,d.receipt_counter,g,p_type,p_currency,p_total,tax,CASE WHEN ve THEN vr ELSE 0 END,h,prev,
  CASE WHEN cfg.activation_key_set AND cfg.certificate_set AND cfg.device_id<>'' THEN 'queued' ELSE 'awaiting_device' END);
END $$;
REVOKE ALL ON FUNCTION public.zimra_record_receipt(uuid,uuid,uuid,text,text,numeric) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.zimra_on_sale() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM public.zimra_record_receipt(NEW.store_id, NEW.id, NULL, 'FiscalInvoice', 'USD', NEW.total); RETURN NEW; END $$;
CREATE TRIGGER zz_zimra_sale AFTER INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION public.zimra_on_sale();
CREATE OR REPLACE FUNCTION public.zimra_on_refund() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM public.zimra_record_receipt(NEW.store_id, NULL, NEW.id, 'CreditNote', 'USD', NEW.amount); RETURN NEW; END $$;
CREATE TRIGGER zz_zimra_refund AFTER INSERT ON public.refunds FOR EACH ROW EXECUTE FUNCTION public.zimra_on_refund();

CREATE OR REPLACE FUNCTION public.save_zimra_config(p jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid := public.current_store_id();
BEGIN
 IF sid IS NULL OR NOT public.is_owner_admin(auth.uid()) THEN RAISE EXCEPTION 'Only the owner can change ZIMRA settings'; END IF;
 INSERT INTO zimra_config(store_id) VALUES (sid) ON CONFLICT DO NOTHING;
 UPDATE zimra_config SET enabled=coalesce((p->>'enabled')::boolean,enabled), environment=coalesce(p->>'environment',environment),
  device_id=coalesce(trim(p->>'device_id'),device_id), device_serial=coalesce(trim(p->>'device_serial'),device_serial),
  device_model=coalesce(trim(p->>'device_model'),device_model), device_version=coalesce(trim(p->>'device_version'),device_version),
  taxpayer_name=coalesce(trim(p->>'taxpayer_name'),taxpayer_name), taxpayer_tin=coalesce(trim(p->>'taxpayer_tin'),taxpayer_tin),
  vat_number=coalesce(trim(p->>'vat_number'),vat_number), bp_number=coalesce(trim(p->>'bp_number'),bp_number), updated_at=now()
 WHERE store_id=sid;
 IF coalesce(p->>'activation_key','')<>'' THEN
  INSERT INTO zimra_secrets(store_id,activation_key) VALUES (sid,p->>'activation_key') ON CONFLICT (store_id) DO UPDATE SET activation_key=excluded.activation_key, updated_at=now();
  UPDATE zimra_config SET activation_key_set=true WHERE store_id=sid;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.save_zimra_config(jsonb) FROM public, anon; GRANT EXECUTE ON FUNCTION public.save_zimra_config(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.zimra_close_fiscal_day() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid := public.current_store_id();
BEGIN
 IF sid IS NULL OR NOT public.can_manage_staff(auth.uid()) THEN RAISE EXCEPTION 'Only an owner or manager can close the fiscal day'; END IF;
 UPDATE zimra_fiscal_days SET status='closed', closed_at=now(), closed_by=auth.uid() WHERE store_id=sid AND status='open';
END $$;
REVOKE ALL ON FUNCTION public.zimra_close_fiscal_day() FROM public, anon; GRANT EXECUTE ON FUNCTION public.zimra_close_fiscal_day() TO authenticated;