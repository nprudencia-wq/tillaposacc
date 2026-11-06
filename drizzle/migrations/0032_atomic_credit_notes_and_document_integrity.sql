ALTER TABLE public.sales_documents ADD COLUMN client_ref uuid;
CREATE UNIQUE INDEX credit_note_retry_key ON public.sales_documents(store_id,client_ref) WHERE client_ref IS NOT NULL;
CREATE OR REPLACE FUNCTION public.credit_note_refund(p_sale uuid,p_items jsonb,p_reason text,p_method text,p_client_ref uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE s record; existing record; result jsonb; note uuid; line jsonb; item record; BEGIN
IF p_client_ref IS NULL OR NOT public.can_refund(auth.uid()) THEN RAISE EXCEPTION 'Not authorised or missing reference'; END IF;
SELECT * INTO s FROM public.sales WHERE id=p_sale AND store_id=public.current_store_id() FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;
SELECT * INTO existing FROM public.sales_documents WHERE store_id=public.current_store_id() AND client_ref=p_client_ref; IF FOUND THEN RETURN jsonb_build_object('document_id',existing.id,'amount',existing.total,'duplicate',true); END IF;
IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x WHERE x->>'condition' NOT IN ('sellable','damaged')) THEN RAISE EXCEPTION 'Invalid return condition'; END IF;
result:=public.refund_sale(p_sale,p_items,p_reason,p_method);
FOR line IN SELECT * FROM jsonb_array_elements(p_items) LOOP IF line->>'condition'='damaged' AND (line->>'quantity')::numeric>0 THEN SELECT * INTO item FROM public.sale_items WHERE id=(line->>'sale_item_id')::uuid AND sale_id=p_sale; IF item.product_id IS NOT NULL THEN PERFORM public.adjust_stock(item.product_id,-(line->>'quantity')::numeric,'damaged','Credit note damaged return: '||p_reason); END IF; END IF; END LOOP;
note:=public.issue_credit_note((result->>'refund_id')::uuid); UPDATE public.sales_documents SET client_ref=p_client_ref WHERE id=note;
RETURN result||jsonb_build_object('document_id',note); END $$;
REVOKE ALL ON FUNCTION public.credit_note_refund(uuid,jsonb,text,text,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.credit_note_refund(uuid,jsonb,text,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.document_reference_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE sid uuid; BEGIN
IF NEW.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.customers WHERE id=NEW.customer_id AND store_id=NEW.store_id) THEN RAISE EXCEPTION 'Customer belongs to another shop'; END IF;
IF NEW.sale_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sales WHERE id=NEW.sale_id AND store_id=NEW.store_id) THEN RAISE EXCEPTION 'Sale belongs to another shop'; END IF;
IF NEW.refund_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.refunds WHERE id=NEW.refund_id AND store_id=NEW.store_id AND sale_id=NEW.sale_id) THEN RAISE EXCEPTION 'Refund reference mismatch'; END IF;
IF NEW.source_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sales_documents WHERE id=NEW.source_id AND store_id=NEW.store_id) THEN RAISE EXCEPTION 'Source belongs to another shop'; END IF;
RETURN NEW; END $$;
CREATE TRIGGER document_reference_guard BEFORE INSERT OR UPDATE ON public.sales_documents FOR EACH ROW EXECUTE FUNCTION public.document_reference_guard();
CREATE OR REPLACE FUNCTION public.close_shift(p_actual_usd numeric,p_actual_zig numeric,p_notes text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF EXISTS(SELECT 1 FROM public.cashier_shifts WHERE cashier_id=auth.uid() AND status='open' AND (opening_float_zar<>0 OR EXISTS(SELECT 1 FROM public.sale_payments p JOIN public.sales s ON s.id=p.sale_id WHERE s.shift_id=cashier_shifts.id AND p.currency='ZAR'))) THEN RAISE EXCEPTION 'Use the three-currency cash count to close this shift'; END IF; RETURN public.close_shift_three(p_actual_usd,p_actual_zig,0,p_notes); END $$;