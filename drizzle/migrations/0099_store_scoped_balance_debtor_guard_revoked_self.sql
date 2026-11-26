CREATE OR REPLACE FUNCTION public.adjust_customer_balance(p_customer uuid, p_kind text, p_amount numeric, p_note text DEFAULT ''::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id UUID; v_store uuid := public.current_store_id();
BEGIN
  IF v_store IS NULL OR NOT public.can_adjust_customer_balance() THEN
    RAISE EXCEPTION 'You do not have permission to adjust customer balances';
  END IF;
  IF p_kind NOT IN ('charge', 'credit') THEN RAISE EXCEPTION 'Adjustment must be a charge or a credit'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer AND store_id = v_store) THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;
  INSERT INTO public.customer_adjustments (customer_id, kind, amount, note, created_by, store_id)
  VALUES (p_customer, p_kind, p_amount, COALESCE(p_note, ''), auth.uid(), v_store)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_debtor_rule_fields()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
begin
  if current_user in ('authenticated','anon') and (
     new.debtor_interest_rate is distinct from old.debtor_interest_rate
     or new.interest_after_days is distinct from old.interest_after_days
     or new.bad_debt_provision_rate is distinct from old.bad_debt_provision_rate
     or new.provision_after_days is distinct from old.provision_after_days
     or new.interest_auto is distinct from old.interest_auto)
     and not public.is_owner_admin(auth.uid()) then
    raise exception 'Only the owner can change debtor rules';
  end if;
  return new;
end $function$;

DROP TRIGGER IF EXISTS guard_debtor_rule_fields ON public.settings;
CREATE TRIGGER guard_debtor_rule_fields BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_debtor_rule_fields();

CREATE OR REPLACE FUNCTION public.revoked_offline_staff(p_ids uuid[])
 RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT p.store_id FROM public.profiles p WHERE p.id = auth.uid())
  SELECT COALESCE(array_agg(i), '{}') FROM unnest(COALESCE(p_ids, '{}')) AS i
  WHERE auth.uid() IS NOT NULL AND cardinality(p_ids) <= 200
    AND (
      (i = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = i AND p.active = false))
      OR (public.current_store_id() IS NOT NULL AND (
        NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = i)
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = i AND p.store_id = public.current_store_id() AND p.active = false)))
    );
$function$;