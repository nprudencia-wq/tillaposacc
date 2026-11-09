ALTER TABLE public.shift_cash_movements ADD COLUMN IF NOT EXISTS client_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS shift_cash_movements_store_client_ref ON public.shift_cash_movements (store_id, client_ref) WHERE client_ref IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_offline_cash_movement(p_client_ref text, p_shift uuid, p_type text, p_currency text, p_amount numeric, p_reason text, p_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_uid uuid := auth.uid(); sid uuid := public.current_store_id(); v_id uuid; v_shift uuid; v_opened timestamptz; v_closed timestamptz; v_when timestamptz;
begin
  if not public.is_staff(v_uid) then raise exception 'Not authorised'; end if;
  if coalesce(p_client_ref,'') = '' then raise exception 'Missing offline reference'; end if;
  PERFORM pg_advisory_xact_lock(hashtextextended(sid::text || ':move:' || p_client_ref, 0));
  select id into v_id from shift_cash_movements where store_id = sid and client_ref = p_client_ref;
  if v_id is not null then return v_id; end if;
  if p_type not in ('cash_drop','paid_out','paid_in') then raise exception 'Bad type'; end if;
  if p_currency not in ('USD','ZiG','ZAR') then raise exception 'Bad currency'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'Amount must be more than zero'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'A reason is required'; end if;
  select id, opened_at, closed_at into v_shift, v_opened, v_closed from cashier_shifts where id = p_shift and cashier_id = v_uid and store_id = sid;
  if v_shift is null then raise exception 'No shift found for this offline cash movement'; end if;
  v_when := greatest(least(coalesce(p_at, now()), now(), coalesce(v_closed, now())), v_opened);
  insert into shift_cash_movements (shift_id, type, currency, amount, reason, user_id, created_at, client_ref, store_id)
  values (v_shift, p_type, p_currency, round(p_amount,2), p_reason, v_uid, v_when, p_client_ref, sid)
  returning id into v_id;
  return v_id;
end $function$;
REVOKE ALL ON FUNCTION public.record_offline_cash_movement(text, uuid, text, text, numeric, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_offline_cash_movement(text, uuid, text, text, numeric, text, timestamptz) TO authenticated;