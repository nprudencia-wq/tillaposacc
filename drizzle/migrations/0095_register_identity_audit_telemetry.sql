CREATE TABLE public.register_heartbeats (
 store_id uuid NOT NULL REFERENCES public.stores(id), register_id text NOT NULL CHECK(register_id IN ('REG-01','REG-02','REG-03','REG-04','REG-05')), device_id uuid NOT NULL, assigned_by uuid NOT NULL, printer_status text NOT NULL DEFAULT 'unknown', scanner_status text NOT NULL DEFAULT 'unknown', offline_queue_count integer NOT NULL DEFAULT 0 CHECK(offline_queue_count>=0), app_version text NOT NULL DEFAULT '', last_seen timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(store_id,register_id), UNIQUE(store_id,device_id)
);
GRANT SELECT ON public.register_heartbeats TO authenticated;
GRANT ALL ON public.register_heartbeats TO service_role;
ALTER TABLE public.register_heartbeats ENABLE ROW LEVEL SECURITY;
CREATE POLICY register_read ON public.register_heartbeats FOR SELECT TO authenticated USING(store_id=public.current_store_id() AND public.is_staff(auth.uid()));
CREATE TABLE public.cashier_audit_trails (
 id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES public.stores(id), cashier_id uuid NOT NULL, register_id text NOT NULL, action text NOT NULL CHECK(action IN ('VOID_ITEM','PRICE_OVERRIDE','NO_SALE_DRAWER_OPEN','REFUND','SHIFT_OPEN','SHIFT_CLOSE')), details jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cashier_audit_trails TO authenticated;
GRANT ALL ON public.cashier_audit_trails TO service_role;
ALTER TABLE public.cashier_audit_trails ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON public.cashier_audit_trails FOR SELECT TO authenticated USING(store_id=public.current_store_id() AND public.is_staff(auth.uid()) AND (cashier_id=auth.uid() OR public.can_manage_staff(auth.uid())));
CREATE INDEX register_audit_day ON public.cashier_audit_trails(store_id,register_id,occurred_at);
CREATE TABLE public.system_errors (
 id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES public.stores(id), cashier_id uuid NOT NULL, register_id text NOT NULL, category text NOT NULL CHECK(category IN ('hardware','sync','runtime')), message text NOT NULL, occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.system_errors TO authenticated;
GRANT ALL ON public.system_errors TO service_role;
ALTER TABLE public.system_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY error_read ON public.system_errors FOR SELECT TO authenticated USING(store_id=public.current_store_id() AND public.is_staff(auth.uid()) AND (cashier_id=auth.uid() OR public.can_manage_staff(auth.uid())));
CREATE INDEX register_error_day ON public.system_errors(store_id,occurred_at);
CREATE FUNCTION public.assign_register(p_register_id text,p_device_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s uuid := public.current_store_id(); BEGIN
 IF s IS NULL OR NOT public.is_staff(auth.uid()) OR NOT public.can_manage_staff(auth.uid()) THEN RAISE EXCEPTION 'Manager permission required'; END IF;
 IF p_register_id NOT IN ('REG-01','REG-02','REG-03','REG-04','REG-05') THEN RAISE EXCEPTION 'Invalid register'; END IF;
 IF EXISTS(SELECT 1 FROM public.register_heartbeats WHERE store_id=s AND register_id=p_register_id AND device_id<>p_device_id) THEN RAISE EXCEPTION 'Register already assigned to another device'; END IF;
 IF EXISTS(SELECT 1 FROM public.register_heartbeats WHERE store_id=s AND device_id=p_device_id AND register_id<>p_register_id) THEN RAISE EXCEPTION 'Device already assigned to another register'; END IF;
 INSERT INTO public.register_heartbeats(store_id,register_id,device_id,assigned_by) VALUES(s,p_register_id,p_device_id,auth.uid()) ON CONFLICT(store_id,register_id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM public.register_heartbeats WHERE store_id=s AND register_id=p_register_id AND device_id=p_device_id) THEN RAISE EXCEPTION 'Register already assigned'; END IF;
END $$;
CREATE FUNCTION public.upsert_register_heartbeat(p_register_id text,p_device_id uuid,p_printer_status text,p_scanner_status text,p_offline_queue_count integer,p_app_version text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Staff permission required'; END IF;
 UPDATE public.register_heartbeats SET printer_status=left(p_printer_status,40),scanner_status=left(p_scanner_status,40),offline_queue_count=p_offline_queue_count,app_version=left(p_app_version,80),last_seen=now() WHERE store_id=public.current_store_id() AND register_id=p_register_id AND device_id=p_device_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Register not assigned to this device'; END IF;
END $$;
CREATE FUNCTION public.record_register_event(p_id uuid,p_register_id text,p_device_id uuid,p_action text,p_details jsonb,p_occurred_at timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s uuid:=public.current_store_id(); BEGIN
 IF NOT public.is_staff(auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.register_heartbeats WHERE store_id=s AND register_id=p_register_id AND device_id=p_device_id) THEN RAISE EXCEPTION 'Assigned register required'; END IF;
 IF pg_column_size(p_details)>16384 THEN RAISE EXCEPTION 'Event too large'; END IF;
 INSERT INTO public.cashier_audit_trails(id,store_id,cashier_id,register_id,action,details,occurred_at) VALUES(p_id,s,auth.uid(),p_register_id,p_action,p_details,p_occurred_at) ON CONFLICT(id) DO NOTHING;
END $$;
CREATE FUNCTION public.record_system_error(p_id uuid,p_register_id text,p_device_id uuid,p_category text,p_message text,p_occurred_at timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s uuid:=public.current_store_id(); BEGIN
 IF NOT public.is_staff(auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.register_heartbeats WHERE store_id=s AND register_id=p_register_id AND device_id=p_device_id) THEN RAISE EXCEPTION 'Assigned register required'; END IF;
 INSERT INTO public.system_errors(id,store_id,cashier_id,register_id,category,message,occurred_at) VALUES(p_id,s,auth.uid(),p_register_id,p_category,left(p_message,1000),p_occurred_at) ON CONFLICT(id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.assign_register(text,uuid),public.upsert_register_heartbeat(text,uuid,text,text,integer,text),public.record_register_event(uuid,text,uuid,text,jsonb,timestamptz),public.record_system_error(uuid,text,uuid,text,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assign_register(text,uuid),public.upsert_register_heartbeat(text,uuid,text,text,integer,text),public.record_register_event(uuid,text,uuid,text,jsonb,timestamptz),public.record_system_error(uuid,text,uuid,text,text,timestamptz) TO authenticated;