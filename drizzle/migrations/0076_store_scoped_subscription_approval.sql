CREATE OR REPLACE FUNCTION public.decide_subscription_payment(p_payment uuid, p_approve boolean, p_note text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare p record; v_start date; v_end date;
begin
  select * into p from subscription_payments where id = p_payment for update;
  if not found then raise exception 'Payment not found'; end if;
  if p.status <> 'pending' then raise exception 'Already decided'; end if;
  if p.store_id is null then raise exception 'Payment has no shop'; end if;
  if p_approve then
    select greatest(st.paid_until, coalesce(s.trial_ends_at::date - 1, st.paid_until), current_date - 1) + 1 into v_start
      from settings st join stores s on s.id = st.store_id where st.store_id = p.store_id;
    if v_start is null then raise exception 'Shop settings not found'; end if;
    v_end := (v_start + make_interval(months => p.months))::date - 1;
    update settings set paid_until = v_end where store_id = p.store_id;
    update subscription_payments set status='approved', period_from=v_start, period_to=v_end, decided_at=now(), decision_note=p_note where id = p_payment;
  else
    update subscription_payments set status='rejected', decided_at=now(), decision_note=p_note where id = p_payment;
  end if;
end $function$;
REVOKE EXECUTE ON FUNCTION public.decide_subscription_payment(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_subscription_payment(uuid, boolean, text) TO service_role;