-- ============================================================
-- Payment types the shop defines itself (EcoCash, InnBucks, ...)
-- ============================================================
create table public.payment_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_cash boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

grant select on public.payment_types to authenticated;
grant insert, update, delete on public.payment_types to authenticated;
grant all on public.payment_types to service_role;
alter table public.payment_types enable row level security;

create or replace function public.can_manage_payment_types(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id=_user_id and role in ('admin','owner','manager'))
$$;

create policy "staff read payment types" on public.payment_types for select to authenticated using (public.is_staff(auth.uid()));
create policy "managers add payment types" on public.payment_types for insert to authenticated with check (public.can_manage_payment_types(auth.uid()));
create policy "managers edit payment types" on public.payment_types for update to authenticated using (public.can_manage_payment_types(auth.uid())) with check (public.can_manage_payment_types(auth.uid()));
create policy "managers delete payment types" on public.payment_types for delete to authenticated using (public.can_manage_payment_types(auth.uid()));

-- The code stored on records is generated from the name and never reused.
create or replace function public.set_payment_type_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare base text; candidate text; n int := 0;
begin
  if coalesce(trim(new.code), '') = '' then
    base := lower(trim(regexp_replace(coalesce(new.name, ''), '[^a-zA-Z0-9]+', '_', 'g'), '_'));
    if base = '' then base := 'method'; end if;
    candidate := base;
    while exists (select 1 from public.payment_types where code = candidate and id <> new.id) loop
      n := n + 1;
      candidate := base || '_' || n;
    end loop;
    new.code := candidate;
  end if;
  return new;
end $$;

create trigger payment_types_code before insert on public.payment_types for each row execute function public.set_payment_type_code();

-- A type already used on records can be switched off, not deleted.
create or replace function public.guard_payment_type_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.sale_payments where method = old.code)
     or exists (select 1 from public.refunds where method = old.code)
     or exists (select 1 from public.expenses where method = old.code)
     or exists (select 1 from public.supplier_payments where method = old.code) then
    raise exception 'This payment type has already been used, so it cannot be deleted. Switch it off instead.';
  end if;
  return old;
end $$;

create trigger payment_types_delete_guard before delete on public.payment_types for each row execute function public.guard_payment_type_delete();

-- The till must always have at least one type to offer.
create or replace function public.guard_payment_type_deactivate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.active and not new.active
     and not exists (select 1 from public.payment_types where active and id <> old.id) then
    raise exception 'At least one payment type must stay switched on.';
  end if;
  return new;
end $$;

create trigger payment_types_deactivate_guard before update of active on public.payment_types for each row execute function public.guard_payment_type_deactivate();

-- Keep the four methods already recorded on past sales.
insert into public.payment_types (code, name, is_cash, active, sort_order) values
  ('cash', 'Cash', true, true, 1),
  ('mobile_money', 'Mobile money', false, true, 2),
  ('bank_transfer', 'Bank transfer', false, true, 3),
  ('card', 'Card', false, true, 4);

-- The fixed four are no longer the only options.
alter table public.sale_payments drop constraint sale_payments_method_check;

-- Sales and refunds may only use a type that exists.
create or replace function public.check_payment_method_known()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.payment_types where code = new.method) then
    raise exception 'Unknown payment type: %', new.method;
  end if;
  return new;
end $$;

create trigger sale_payments_method_known before insert on public.sale_payments for each row execute function public.check_payment_method_known();
create trigger refunds_method_known before insert on public.refunds for each row execute function public.check_payment_method_known();

-- Which types count as drawer cash is now a setting, not a hard-coded name.
create or replace function public.is_cash_method(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.payment_types where code = p and is_cash)
$$;

revoke execute on function public.can_manage_payment_types(uuid) from anon, public;
revoke execute on function public.is_cash_method(text) from anon, public;
grant execute on function public.can_manage_payment_types(uuid) to authenticated;
grant execute on function public.is_cash_method(text) to authenticated;

-- Shift figures now count every cash-like type, not just the one called 'cash'.
create or replace function public.shift_summary(p_shift uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s record; v_rate_sales jsonb; v_pay jsonb; v_mov jsonb;
  v_cash_usd numeric; v_cash_zig numeric; v_chg_usd numeric; v_chg_zig numeric;
  v_ref_usd numeric; v_ref_zig numeric; v_in_usd numeric; v_in_zig numeric; v_out_usd numeric; v_out_zig numeric;
  v_count int; v_total numeric; v_exp_usd numeric; v_exp_zig numeric;
begin
  select * into s from cashier_shifts where id = p_shift;
  if not found then raise exception 'Shift not found'; end if;
  if not (public.can_refund(auth.uid()) or public.can_post_expense(auth.uid()) or (s.cashier_id = auth.uid() and s.status = 'closed')) then
    raise exception 'Only a supervisor or manager can read a shift before it is closed';
  end if;
  select count(*), coalesce(sum(total),0) into v_count, v_total from sales where shift_id = p_shift;
  select coalesce(jsonb_agg(jsonb_build_object('method', method, 'currency', currency, 'amount', amt)), '[]'::jsonb) into v_pay
    from (select sp.method, sp.currency, sum(sp.amount) amt from sale_payments sp join sales x on x.id = sp.sale_id
          where x.shift_id = p_shift group by 1,2 order by 1,2) t;
  select coalesce(sum(sp.amount) filter (where sp.currency='USD'),0), coalesce(sum(sp.amount) filter (where sp.currency='ZiG'),0)
    into v_cash_usd, v_cash_zig from sale_payments sp join sales x on x.id = sp.sale_id where x.shift_id = p_shift and public.is_cash_method(sp.method);
  select coalesce(sum(change_given) filter (where currency<>'ZiG'),0), coalesce(sum(round(change_given*exchange_rate,2)) filter (where currency='ZiG'),0)
    into v_chg_usd, v_chg_zig from sales where shift_id = p_shift;
  select coalesce(sum(r.amount) filter (where x.currency<>'ZiG'),0), coalesce(sum(round(r.amount*x.exchange_rate,2)) filter (where x.currency='ZiG'),0)
    into v_ref_usd, v_ref_zig from refunds r join sales x on x.id = r.sale_id where r.shift_id = p_shift and public.is_cash_method(r.method);
  select coalesce(sum(amount) filter (where type='paid_in' and currency='USD'),0), coalesce(sum(amount) filter (where type='paid_in' and currency='ZiG'),0),
         coalesce(sum(amount) filter (where type<>'paid_in' and currency='USD'),0), coalesce(sum(amount) filter (where type<>'paid_in' and currency='ZiG'),0)
    into v_in_usd, v_in_zig, v_out_usd, v_out_zig from shift_cash_movements where shift_id = p_shift;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb) into v_mov from shift_cash_movements m where shift_id = p_shift;
  v_exp_usd := s.opening_float_usd + v_cash_usd - v_chg_usd - v_ref_usd + v_in_usd - v_out_usd;
  v_exp_zig := s.opening_float_zig + v_cash_zig - v_chg_zig - v_ref_zig + v_in_usd - v_out_usd;
  return jsonb_build_object(
    'shift', to_jsonb(s), 'sales_count', v_count, 'sales_total_usd', v_total, 'payments', v_pay, 'movements', v_mov,
    'cash_in_usd', v_cash_usd, 'cash_in_zig', v_cash_zig, 'change_usd', v_chg_usd, 'change_zig', v_chg_zig,
    'refunds_usd', v_ref_usd, 'refunds_zig', v_ref_zig, 'paid_in_usd', v_in_usd, 'paid_in_zig', v_in_zig,
    'paid_out_usd', v_out_usd, 'paid_out_zig', v_out_zig,
    'expected_usd', round(v_exp_usd,2), 'expected_zig', round(v_exp_zig,2));
end $$;

create or replace function public.close_shift(p_actual_usd numeric, p_actual_zig numeric, p_notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_shift uuid; v_exp_usd numeric; v_exp_zig numeric; s record;
  v_cash_usd numeric; v_cash_zig numeric; v_chg_usd numeric; v_chg_zig numeric; v_ref_usd numeric; v_ref_zig numeric;
  v_in_usd numeric; v_in_zig numeric; v_out_usd numeric; v_out_zig numeric;
begin
  if coalesce(p_actual_usd,-1) < 0 or coalesce(p_actual_zig,-1) < 0 then raise exception 'Enter the cash counted in both currencies (0 if none)'; end if;
  select * into s from cashier_shifts where cashier_id = auth.uid() and status = 'open' for update;
  if not found then raise exception 'No open shift'; end if;
  v_shift := s.id;
  select coalesce(sum(sp.amount) filter (where sp.currency='USD'),0), coalesce(sum(sp.amount) filter (where sp.currency='ZiG'),0)
    into v_cash_usd, v_cash_zig from sale_payments sp join sales x on x.id = sp.sale_id where x.shift_id = v_shift and public.is_cash_method(sp.method);
  select coalesce(sum(change_given) filter (where currency<>'ZiG'),0), coalesce(sum(round(change_given*exchange_rate,2)) filter (where currency='ZiG'),0)
    into v_chg_usd, v_chg_zig from sales where shift_id = v_shift;
  select coalesce(sum(r.amount) filter (where x.currency<>'ZiG'),0), coalesce(sum(round(r.amount*x.exchange_rate,2)) filter (where x.currency='ZiG'),0)
    into v_ref_usd, v_ref_zig from refunds r join sales x on x.id = r.sale_id where r.shift_id = v_shift and public.is_cash_method(r.method);
  select coalesce(sum(amount) filter (where type='paid_in' and currency='USD'),0), coalesce(sum(amount) filter (where type='paid_in' and currency='ZiG'),0),
         coalesce(sum(amount) filter (where type<>'paid_in' and currency='USD'),0), coalesce(sum(amount) filter (where type<>'paid_in' and currency='ZiG'),0)
    into v_in_usd, v_in_zig, v_out_usd, v_out_zig from shift_cash_movements where shift_id = v_shift;
  v_exp_usd := round(s.opening_float_usd + v_cash_usd - v_chg_usd - v_ref_usd + v_in_usd - v_out_usd, 2);
  v_exp_zig := round(s.opening_float_zig + v_cash_zig - v_chg_zig - v_ref_zig + v_in_usd - v_out_usd, 2);
  update cashier_shifts set status = 'closed', closed_at = now(),
    actual_cash_usd = round(p_actual_usd,2), actual_cash_zig = round(p_actual_zig,2),
    expected_cash_usd = v_exp_usd, expected_cash_zig = v_exp_zig,
    variance_usd = round(p_actual_usd,2) - v_exp_usd, variance_zig = round(p_actual_zig,2) - v_exp_zig,
    notes = nullif(trim(coalesce(p_notes,'')),'')
  where id = v_shift;
  return v_shift;
end $$;

-- Offline uploads: non-cash payments still need checking, cash-like ones do not.
create or replace function public.complete_offline_sale(p_client_ref text, p_items jsonb, p_payments jsonb, p_discount numeric, p_currency text, p_sold_at timestamptz, p_shift uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_rate numeric; v_shift uuid; v_opened timestamptz; v_existing record;
  v_sale_id uuid; v_sale_no text; v_sub numeric := 0; v_total numeric; v_paid numeric := 0; v_change numeric;
  it jsonb; p record; v_qty numeric; v_new numeric; v_when timestamptz; v_price numeric; v_cost numeric;
begin
  if not public.is_staff(v_uid) then raise exception 'Not authorised'; end if;
  if coalesce(p_client_ref,'') = '' then raise exception 'Missing offline reference'; end if;
  select id, sale_number into v_existing from sales where client_ref = p_client_ref;
  if found then return jsonb_build_object('id', v_existing.id, 'sale_number', v_existing.sale_number, 'duplicate', true); end if;
  select id, opened_at into v_shift, v_opened from cashier_shifts where id = p_shift and cashier_id = v_uid;
  if v_shift is null then select id, opened_at into v_shift, v_opened from cashier_shifts where cashier_id = v_uid and status='open'; end if;
  if v_shift is null then raise exception 'No shift found for this offline sale'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Cart is empty'; end if;
  v_when := least(greatest(coalesce(p_sold_at, now()), v_opened), now());
  select zig_rate into v_rate from rate_history where effective_from <= v_when order by effective_from desc limit 1;
  if v_rate is null then select zig_rate into v_rate from settings where id=1; end if;

  create temp table if not exists _offline_lines (product_id uuid, name text, qty numeric, price numeric, cost numeric) on commit drop;
  truncate _offline_lines;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into p from products where id=(it->>'product_id')::uuid for update;
    if not found then raise exception 'Product not found'; end if;
    v_qty := (it->>'quantity')::numeric;
    if v_qty <= 0 then raise exception 'Invalid quantity'; end if;
    select h.selling_price, h.cost_price into v_price, v_cost from price_history h
      where h.product_id = p.id and h.effective_from <= v_when order by h.effective_from desc limit 1;
    v_price := coalesce(v_price, p.selling_price); v_cost := coalesce(v_cost, p.cost_price);
    insert into _offline_lines values (p.id, p.name, v_qty, v_price, v_cost);
    v_sub := v_sub + round(v_price * v_qty, 2);
  end loop;
  v_total := v_sub - least(greatest(coalesce(p_discount,0),0), v_sub);
  select coalesce(sum(case when x->>'currency'='ZiG' then (x->>'amount')::numeric / v_rate else (x->>'amount')::numeric end),0)
    into v_paid from jsonb_array_elements(p_payments) x;
  v_change := greatest(round(v_paid - v_total, 2), 0);
  insert into sales (cashier_id, subtotal, discount, total, currency, exchange_rate, amount_paid, change_given, shift_id, created_at, client_ref, offline, synced_at)
  values (v_uid, v_sub, v_sub - v_total, v_total, p_currency, v_rate, round(v_paid,2), v_change, v_shift, v_when, p_client_ref, true, now())
  returning id, sale_number into v_sale_id, v_sale_no;
  for p in select * from _offline_lines loop
    insert into sale_items (sale_id, product_id, name, quantity, unit_price, cost_price, line_total)
    values (v_sale_id, p.product_id, p.name, p.qty, p.price, p.cost, round(p.price*p.qty,2));
    update products set stock = stock - p.qty where id=p.product_id returning stock into v_new;
    insert into stock_movements (product_id, type, quantity, balance_after, reference, note, user_id)
    values (p.product_id, 'sale', -p.qty, v_new, v_sale_no, 'Offline sale ' || p_client_ref, v_uid);
  end loop;
  insert into sale_payments (sale_id, method, currency, amount, verified)
  select v_sale_id, x->>'method', x->>'currency', (x->>'amount')::numeric, public.is_cash_method(x->>'method') from jsonb_array_elements(p_payments) x;
  return jsonb_build_object('id', v_sale_id, 'sale_number', v_sale_no, 'total', v_total, 'rate', v_rate, 'underpaid', round(v_paid,2) < round(v_total,2));
end $$;