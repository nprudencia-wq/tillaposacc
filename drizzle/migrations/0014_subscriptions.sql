alter table public.settings
  add column if not exists plan_name text not null default 'Monthly plan',
  add column if not exists plan_price_usd numeric not null default 30,
  add column if not exists paid_until date not null default (current_date + 14),
  add column if not exists grace_days integer not null default 5,
  add column if not exists vendor_name text not null default '',
  add column if not exists vendor_pay_details text not null default '';

create sequence if not exists public.sub_payment_seq start 1001;

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null default ('SUB-' || nextval('public.sub_payment_seq')),
  months integer not null check (months between 1 and 24),
  amount numeric not null check (amount > 0),
  method text not null,
  reference text not null,
  payer_phone text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  period_from date,
  period_to date,
  submitted_by uuid not null,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decision_note text
);
grant select on public.subscription_payments to authenticated;
grant all on public.subscription_payments to service_role;
alter table public.subscription_payments enable row level security;
create policy "Staff view subscription payments" on public.subscription_payments for select to authenticated using (public.is_staff(auth.uid()));

-- status: active | grace | locked
create or replace function public.subscription_state()
returns text language sql stable security definer set search_path = public as $$
  select case when current_date <= paid_until then 'active'
              when current_date <= paid_until + grace_days then 'grace'
              else 'locked' end
  from public.settings where id = 1
$$;
grant execute on function public.subscription_state() to authenticated;

create or replace function public.submit_subscription_payment(p_months integer, p_method text, p_reference text, p_phone text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_price numeric;
begin
  if not public.is_owner_admin(auth.uid()) and not public.has_role(auth.uid(),'manager') then
    raise exception 'Only the owner or a manager can pay the subscription';
  end if;
  if p_months is null or p_months < 1 or p_months > 24 then raise exception 'Choose 1 to 24 months'; end if;
  if coalesce(trim(p_reference),'') = '' then raise exception 'Enter the payment reference'; end if;
  select plan_price_usd into v_price from settings where id = 1;
  insert into subscription_payments(months, amount, method, reference, payer_phone, submitted_by)
  values (p_months, v_price * p_months, p_method, trim(p_reference), nullif(trim(p_phone),''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.submit_subscription_payment(integer,text,text,text) from anon, public;
grant execute on function public.submit_subscription_payment(integer,text,text,text) to authenticated;

-- vendor-only (called from the server with the vendor code)
create or replace function public.decide_subscription_payment(p_payment uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare p record; v_start date; v_end date;
begin
  select * into p from subscription_payments where id = p_payment for update;
  if not found then raise exception 'Payment not found'; end if;
  if p.status <> 'pending' then raise exception 'Already decided'; end if;
  if p_approve then
    select greatest(paid_until, current_date - 1) + 1 into v_start from settings where id = 1;
    v_end := (v_start + make_interval(months => p.months))::date - 1;
    update settings set paid_until = v_end where id = 1;
    update subscription_payments set status='approved', period_from=v_start, period_to=v_end, decided_at=now(), decision_note=p_note where id = p_payment;
  else
    update subscription_payments set status='rejected', decided_at=now(), decision_note=p_note where id = p_payment;
  end if;
end $$;
revoke execute on function public.decide_subscription_payment(uuid,boolean,text) from anon, public, authenticated;
grant execute on function public.decide_subscription_payment(uuid,boolean,text) to service_role;

create or replace function public.vendor_update_plan(p_price numeric, p_grace integer, p_paid_until date, p_vendor text, p_details text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update settings set plan_price_usd = p_price, grace_days = p_grace, paid_until = p_paid_until,
    vendor_name = coalesce(p_vendor,''), vendor_pay_details = coalesce(p_details,'') where id = 1;
end $$;
revoke execute on function public.vendor_update_plan(numeric,integer,date,text,text) from anon, public, authenticated;
grant execute on function public.vendor_update_plan(numeric,integer,date,text,text) to service_role;

-- shop staff must not edit billing fields directly
create or replace function public.guard_billing_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated','anon') and (
     new.plan_price_usd is distinct from old.plan_price_usd or new.paid_until is distinct from old.paid_until
     or new.grace_days is distinct from old.grace_days or new.vendor_name is distinct from old.vendor_name
     or new.vendor_pay_details is distinct from old.vendor_pay_details or new.plan_name is distinct from old.plan_name) then
    raise exception 'Billing details can only be changed by your software provider';
  end if;
  return new;
end $$;
create trigger trg_guard_billing before update on public.settings for each row execute function public.guard_billing_fields();

-- till lock after grace period (offline uploads still allowed so queued sales aren't lost)
create or replace function public.enforce_subscription()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not new.offline and public.subscription_state() = 'locked' then
    raise exception 'Subscription expired. Ask the owner to renew on the Billing page.';
  end if;
  return new;
end $$;
create trigger trg_enforce_subscription before insert on public.sales for each row execute function public.enforce_subscription();