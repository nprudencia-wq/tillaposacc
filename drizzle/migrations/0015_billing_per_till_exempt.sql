alter table public.settings
  add column if not exists till_count integer not null default 1,
  add column if not exists billing_exempt boolean not null default false;
alter table public.settings alter column plan_price_usd set default 10;
alter table public.subscription_payments add column if not exists tills integer not null default 1;

create or replace function public.subscription_state()
returns text language sql stable security definer set search_path = public as $$
  select case when billing_exempt then 'active'
              when current_date <= paid_until then 'active'
              when current_date <= paid_until + grace_days then 'grace'
              else 'locked' end
  from public.settings where id = 1
$$;

create or replace function public.submit_subscription_payment(p_months integer, p_method text, p_reference text, p_phone text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_price numeric; v_tills int; v_exempt boolean;
begin
  if not public.is_owner_admin(auth.uid()) and not public.has_role(auth.uid(),'manager') then
    raise exception 'Only the owner or a manager can pay the subscription';
  end if;
  select plan_price_usd, till_count, billing_exempt into v_price, v_tills, v_exempt from settings where id = 1;
  if v_exempt then raise exception 'This shop does not pay a subscription'; end if;
  if p_months is null or p_months < 1 or p_months > 24 then raise exception 'Choose 1 to 24 months'; end if;
  if coalesce(trim(p_reference),'') = '' then raise exception 'Enter the payment reference'; end if;
  insert into subscription_payments(months, tills, amount, method, reference, payer_phone, submitted_by)
  values (p_months, v_tills, v_price * v_tills * p_months, p_method, trim(p_reference), nullif(trim(p_phone),''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.vendor_update_billing(p_price numeric, p_tills integer, p_exempt boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_tills < 1 then raise exception 'At least 1 till'; end if;
  update settings set plan_price_usd = p_price, till_count = p_tills, billing_exempt = p_exempt where id = 1;
end $$;
revoke execute on function public.vendor_update_billing(numeric,integer,boolean) from anon, public, authenticated;
grant execute on function public.vendor_update_billing(numeric,integer,boolean) to service_role;

create or replace function public.guard_billing_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated','anon') and (
     new.plan_price_usd is distinct from old.plan_price_usd or new.paid_until is distinct from old.paid_until
     or new.grace_days is distinct from old.grace_days or new.vendor_name is distinct from old.vendor_name
     or new.vendor_pay_details is distinct from old.vendor_pay_details or new.plan_name is distinct from old.plan_name
     or new.till_count is distinct from old.till_count or new.billing_exempt is distinct from old.billing_exempt) then
    raise exception 'Billing details can only be changed by your software provider';
  end if;
  return new;
end $$;