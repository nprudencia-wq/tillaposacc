CREATE TABLE public.staff_pins (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.staff_pins TO service_role;
ALTER TABLE public.staff_pins ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.time_clock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz,
  note text
);
CREATE UNIQUE INDEX time_clock_one_open ON public.time_clock(user_id) WHERE clock_out IS NULL;
CREATE INDEX time_clock_in_idx ON public.time_clock(clock_in);
GRANT SELECT ON public.time_clock TO authenticated;
GRANT ALL ON public.time_clock TO service_role;
ALTER TABLE public.time_clock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or managers read clock" ON public.time_clock FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_staff(auth.uid()));

CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_created_idx ON public.activity_log(created_at DESC);
GRANT SELECT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers read activity" ON public.activity_log FOR SELECT TO authenticated
  USING (public.can_manage_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_event(p_action text, p_details text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF p_action NOT IN ('login','logout','pin_login') THEN RAISE EXCEPTION 'Unknown event'; END IF;
  INSERT INTO activity_log(user_id, action, details) VALUES (auth.uid(), p_action, left(p_details, 200));
END $$;

CREATE OR REPLACE FUNCTION public.clock_in() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF EXISTS (SELECT 1 FROM time_clock WHERE user_id = auth.uid() AND clock_out IS NULL) THEN RAISE EXCEPTION 'You are already clocked in'; END IF;
  INSERT INTO time_clock(user_id) VALUES (auth.uid()) RETURNING id INTO v;
  INSERT INTO activity_log(user_id, action) VALUES (auth.uid(), 'clock_in');
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.clock_out() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE time_clock SET clock_out = now() WHERE user_id = auth.uid() AND clock_out IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'You are not clocked in'; END IF;
  INSERT INTO activity_log(user_id, action) VALUES (auth.uid(), 'clock_out');
END $$;

CREATE OR REPLACE FUNCTION public.set_staff_pin(p_user uuid, p_pin text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF p_pin !~ '^[0-9]{4,6}$' THEN RAISE EXCEPTION 'PIN must be 4 to 6 digits'; END IF;
  IF p_user <> auth.uid() THEN
    IF NOT public.can_manage_staff(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
    IF NOT public.is_owner_admin(auth.uid()) AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = p_user AND role IN ('admin','owner','manager')) THEN
      RAISE EXCEPTION 'Managers can only set PINs for their staff'; END IF;
  END IF;
  INSERT INTO staff_pins(user_id, pin_hash) VALUES (p_user, crypt(p_pin, gen_salt('bf')))
  ON CONFLICT (user_id) DO UPDATE SET pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = NULL, updated_at = now();
  INSERT INTO activity_log(user_id, action, details) VALUES (auth.uid(), 'pin_set', (SELECT coalesce(username, full_name) FROM profiles WHERE id = p_user));
END $$;

CREATE OR REPLACE FUNCTION public.has_staff_pin(p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (p_user = auth.uid() OR public.can_manage_staff(auth.uid())) AND EXISTS (SELECT 1 FROM staff_pins WHERE user_id = p_user)
$$;

-- Server-only: returns the user id when username+PIN match; locks after 5 wrong tries for 5 minutes.
CREATE OR REPLACE FUNCTION public.check_staff_pin(p_username text, p_pin text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE r record;
BEGIN
  SELECT sp.*, p.active INTO r FROM staff_pins sp JOIN profiles p ON p.id = sp.user_id WHERE p.username = lower(trim(p_username));
  IF NOT FOUND OR NOT r.active THEN RETURN NULL; END IF;
  IF r.locked_until IS NOT NULL AND r.locked_until > now() THEN RAISE EXCEPTION 'Too many wrong PINs. Try again in a few minutes.'; END IF;
  IF r.pin_hash = crypt(p_pin, r.pin_hash) THEN
    UPDATE staff_pins SET failed_attempts = 0, locked_until = NULL WHERE user_id = r.user_id;
    RETURN r.user_id;
  END IF;
  UPDATE staff_pins SET failed_attempts = failed_attempts + 1,
    locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '5 minutes' END,
    failed_attempts = CASE WHEN failed_attempts + 1 >= 5 THEN 0 ELSE failed_attempts + 1 END
  WHERE user_id = r.user_id;
  INSERT INTO activity_log(user_id, action) VALUES (r.user_id, 'pin_failed');
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.check_staff_pin(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_staff_pin(text, text) TO service_role;

-- Automatic activity trail
CREATE OR REPLACE FUNCTION public.log_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d text; a text; u uuid := auth.uid();
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'sales' THEN a := 'sale'; d := NEW.sale_number || ' $' || NEW.total;
    WHEN 'refunds' THEN a := 'refund'; d := '$' || NEW.amount || ' — ' || NEW.reason;
    WHEN 'cashier_shifts' THEN
      IF TG_OP = 'INSERT' THEN a := 'shift_open'; d := NEW.shift_number;
      ELSIF NEW.status = 'closed' AND OLD.status <> 'closed' THEN a := 'shift_close'; d := NEW.shift_number || ' variance $' || coalesce(NEW.variance_usd, 0);
      ELSE RETURN NEW; END IF;
    WHEN 'shift_cash_movements' THEN a := NEW.type; d := NEW.currency || ' ' || NEW.amount || ' — ' || NEW.reason;
    WHEN 'expenses' THEN a := 'expense'; d := NEW.category || ' $' || NEW.amount;
    WHEN 'stock_movements' THEN
      IF NEW.type IN ('sale','refund') THEN RETURN NEW; END IF;
      a := 'stock_' || NEW.type; d := (SELECT name FROM products WHERE id = NEW.product_id) || ' ' || NEW.quantity;
    WHEN 'price_history' THEN a := 'price_change'; d := (SELECT name FROM products WHERE id = NEW.product_id) || ' → $' || NEW.selling_price;
    WHEN 'user_roles' THEN a := 'role_change'; d := (SELECT coalesce(username, full_name) FROM profiles WHERE id = NEW.user_id) || ' → ' || NEW.role;
    WHEN 'user_permissions' THEN a := 'access_change'; d := (SELECT coalesce(username, full_name) FROM profiles WHERE id = NEW.user_id) || ' ' || NEW.permission || '=' || NEW.allowed;
    WHEN 'customer_payments' THEN a := 'debt_payment'; d := NEW.payment_number || ' $' || NEW.amount;
    WHEN 'customer_adjustments' THEN a := 'balance_' || NEW.kind; d := '$' || NEW.amount || ' — ' || NEW.note;
    ELSE a := TG_TABLE_NAME;
  END CASE;
  INSERT INTO activity_log(user_id, action, details) VALUES (u, a, left(d, 200));
  RETURN NEW;
END $$;

CREATE TRIGGER trg_log_sales AFTER INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER trg_log_refunds AFTER INSERT ON public.refunds FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER trg_log_shifts AFTER INSERT OR UPDATE ON public.cashier_shifts FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER trg_log_cash AFTER INSERT ON public.shift_cash_movements FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER trg_log_expenses AFTER INSERT ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER trg_log_stock AFTER INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER trg_log_price AFTER INSERT ON public.price_history FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER trg_log_roles AFTER INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER trg_log_perms AFTER INSERT OR UPDATE ON public.user_permissions FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER trg_log_custpay AFTER INSERT ON public.customer_payments FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER trg_log_custadj AFTER INSERT ON public.customer_adjustments FOR EACH ROW EXECUTE FUNCTION public.log_activity();