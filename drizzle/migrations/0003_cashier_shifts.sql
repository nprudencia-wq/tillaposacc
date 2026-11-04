create sequence if not exists public.shift_number_seq start 1001;

create table public.cashier_shifts (
  id uuid primary key default gen_random_uuid(),
  shift_number text not null default ('SH-' || nextval('public.shift_number_seq')),
  cashier_id uuid not null,
  status text not null default 'open',
  opened_at timestamptz not null default now(),
  opening_float_usd numeric not null default 0,
  opening_float_zig numeric not null default 0,
  closed_at timestamptz,
  actual_cash_usd numeric,
  actual_cash_zig numeric,
  expected_cash_usd numeric,
  expected_cash_zig numeric,
  variance_usd numeric,
  variance_zig numeric,
  notes text
);
create unique index cashier_one_open_shift on public.cashier_shifts (cashier_id) where status = 'open';
grant select on public.cashier_shifts to authenticated;
grant all on public.cashier_shifts to service_role;
alter table public.cashier_shifts enable row level security;
create policy "read own or supervised shifts" on public.cashier_shifts for select to authenticated
  using (cashier_id = auth.uid() or public.can_refund(auth.uid()) or public.can_post_expense(auth.uid()));

create table public.shift_cash_movements (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.cashier_shifts(id),
  type text not null,
  currency text not null,
  amount numeric not null,
  reason text not null,
  user_id uuid not null,
  created_at timestamptz not null default now()
);
grant select on public.shift_cash_movements to authenticated;
grant all on public.shift_cash_movements to service_role;
alter table public.shift_cash_movements enable row level security;
create policy "read shift movements" on public.shift_cash_movements for select to authenticated
  using (exists (select 1 from public.cashier_shifts s where s.id = shift_id and (s.cashier_id = auth.uid() or public.can_refund(auth.uid()) or public.can_post_expense(auth.uid()))));

alter table public.sales add column shift_id uuid references public.cashier_shifts(id);
alter table public.refunds add column shift_id uuid references public.cashier_shifts(id);

create or replace function public.open_shift(p_float_usd numeric, p_float_zig numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if not public.is_staff(auth.uid()) then raise exception 'Not authorised'; end if;
  if coalesce(p_float_usd,0) < 0 or coalesce(p_float_zig,0) < 0 then raise exception 'Float cannot be negative'; end if;
  if exists (select 1 from cashier_shifts where cashier_id = auth.uid() and status = 'open') then raise exception 'You already have an open shift'; end if;
  insert into cashier_shifts (cashier_id, opening_float_usd, opening_float_zig)
  values (auth.uid(), coalesce(p_float_usd,0), coalesce(p_float_zig,0)) returning * into v;
  return to_jsonb(v);
end $$;

create or replace function public.record_cash_movement(p_type text, p_currency text, p_amount numeric, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_shift uuid;
begin
  if p_type not in ('cash_drop','paid_out','paid_in') then raise exception 'Bad type'; end if;
  if p_currency not in ('USD','ZiG') then raise exception 'Bad currency'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'Amount must be more than zero'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'A reason is required'; end if;
  select id into v_shift from cashier_shifts where cashier_id = auth.uid() and status = 'open';
  if v_shift is null then raise exception 'Open a shift first'; end if;
  insert into shift_cash_movements (shift_id, type, currency, amount, reason, user_id)
  values (v_shift, p_type, p_currency, round(p_amount,2), p_reason, auth.uid());
end $$;

-- Full figures for a shift (used by X-report and Z-report)
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
    into v_cash_usd, v_cash_zig from sale_payments sp join sales x on x.id = sp.sale_id where x.shift_id = p_shift and sp.method = 'cash';
  select coalesce(sum(change_given) filter (where currency<>'ZiG'),0), coalesce(sum(round(change_given*exchange_rate,2)) filter (where currency='ZiG'),0)
    into v_chg_usd, v_chg_zig from sales where shift_id = p_shift;
  select coalesce(sum(r.amount) filter (where x.currency<>'ZiG'),0), coalesce(sum(round(r.amount*x.exchange_rate,2)) filter (where x.currency='ZiG'),0)
    into v_ref_usd, v_ref_zig from refunds r join sales x on x.id = r.sale_id where r.shift_id = p_shift and r.method = 'cash';
  select coalesce(sum(amount) filter (where type='paid_in' and currency='USD'),0), coalesce(sum(amount) filter (where type='paid_in' and currency='ZiG'),0),
         coalesce(sum(amount) filter (where type<>'paid_in' and currency='USD'),0), coalesce(sum(amount) filter (where type<>'paid_in' and currency='ZiG'),0)
    into v_in_usd, v_in_zig, v_out_usd, v_out_zig from shift_cash_movements where shift_id = p_shift;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb) into v_mov from shift_cash_movements m where shift_id = p_shift;
  v_exp_usd := s.opening_float_usd + v_cash_usd - v_chg_usd - v_ref_usd + v_in_usd - v_out_usd;
  v_exp_zig := s.opening_float_zig + v_cash_zig - v_chg_zig - v_ref_zig + v_in_zig - v_out_zig;
  return jsonb_build_object(
    'shift', to_jsonb(s), 'sales_count', v_count, 'sales_total_usd', v_total, 'payments', v_pay, 'movements', v_mov,
    'cash_in_usd', v_cash_usd, 'cash_in_zig', v_cash_zig, 'change_usd', v_chg_usd, 'change_zig', v_chg_zig,
    'refunds_usd', v_ref_usd, 'refunds_zig', v_ref_zig, 'paid_in_usd', v_in_usd, 'paid_in_zig', v_in_zig,
    'paid_out_usd', v_out_usd, 'paid_out_zig', v_out_zig,
    'expected_usd', round(v_exp_usd,2), 'expected_zig', round(v_exp_zig,2));
end $$;

-- Internal: used by close_shift (bypasses the open-shift read check)
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
    into v_cash_usd, v_cash_zig from sale_payments sp join sales x on x.id = sp.sale_id where x.shift_id = v_shift and sp.method = 'cash';
  select coalesce(sum(change_given) filter (where currency<>'ZiG'),0), coalesce(sum(round(change_given*exchange_rate,2)) filter (where currency='ZiG'),0)
    into v_chg_usd, v_chg_zig from sales where shift_id = v_shift;
  select coalesce(sum(r.amount) filter (where x.currency<>'ZiG'),0), coalesce(sum(round(r.amount*x.exchange_rate,2)) filter (where x.currency='ZiG'),0)
    into v_ref_usd, v_ref_zig from refunds r join sales x on x.id = r.sale_id where r.shift_id = v_shift and r.method = 'cash';
  select coalesce(sum(amount) filter (where type='paid_in' and currency='USD'),0), coalesce(sum(amount) filter (where type='paid_in' and currency='ZiG'),0),
         coalesce(sum(amount) filter (where type<>'paid_in' and currency='USD'),0), coalesce(sum(amount) filter (where type<>'paid_in' and currency='ZiG'),0)
    into v_in_usd, v_in_zig, v_out_usd, v_out_zig from shift_cash_movements where shift_id = v_shift;
  v_exp_usd := round(s.opening_float_usd + v_cash_usd - v_chg_usd - v_ref_usd + v_in_usd - v_out_usd, 2);
  v_exp_zig := round(s.opening_float_zig + v_cash_zig - v_chg_zig - v_ref_zig + v_in_zig - v_out_zig, 2);
  update cashier_shifts set status = 'closed', closed_at = now(),
    actual_cash_usd = round(p_actual_usd,2), actual_cash_zig = round(p_actual_zig,2),
    expected_cash_usd = v_exp_usd, expected_cash_zig = v_exp_zig,
    variance_usd = round(p_actual_usd,2) - v_exp_usd, variance_zig = round(p_actual_zig,2) - v_exp_zig,
    notes = nullif(trim(coalesce(p_notes,'')),'')
  where id = v_shift;
  return v_shift;
end $$;

-- Sales now require an open shift
create or replace function public.complete_sale(p_items jsonb, p_payments jsonb, p_discount numeric, p_currency text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_rate numeric; v_shift uuid;
  v_sale_id uuid; v_sale_no text;
  v_sub numeric := 0; v_total numeric; v_paid numeric := 0; v_change numeric;
  it jsonb; p record; v_qty numeric; v_new numeric; pay jsonb;
begin
  if not public.is_staff(v_uid) then raise exception 'Not authorised'; end if;
  select id into v_shift from cashier_shifts where cashier_id = v_uid and status = 'open';
  if v_shift is null then raise exception 'Open a shift before selling'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Cart is empty'; end if;
  select zig_rate into v_rate from settings where id=1;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into p from products where id=(it->>'product_id')::uuid and active for update;
    if not found then raise exception 'Product not available'; end if;
    v_qty := (it->>'quantity')::numeric;
    if v_qty <= 0 then raise exception 'Invalid quantity'; end if;
    v_sub := v_sub + round(p.selling_price * v_qty, 2);
  end loop;

  if p_discount < 0 or p_discount > v_sub then raise exception 'Invalid discount'; end if;
  v_total := v_sub - p_discount;

  for pay in select * from jsonb_array_elements(p_payments) loop
    v_paid := v_paid + case when pay->>'currency'='ZiG' then (pay->>'amount')::numeric / v_rate else (pay->>'amount')::numeric end;
  end loop;
  if round(v_paid,2) < round(v_total,2) then raise exception 'Payment is less than total'; end if;
  v_change := round(v_paid - v_total, 2);

  insert into sales (cashier_id, subtotal, discount, total, currency, exchange_rate, amount_paid, change_given, shift_id)
  values (v_uid, v_sub, p_discount, v_total, p_currency, v_rate, round(v_paid,2), v_change, v_shift)
  returning id, sale_number into v_sale_id, v_sale_no;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into p from products where id=(it->>'product_id')::uuid;
    v_qty := (it->>'quantity')::numeric;
    insert into sale_items (sale_id, product_id, name, quantity, unit_price, cost_price, line_total)
    values (v_sale_id, p.id, p.name, v_qty, p.selling_price, p.cost_price, round(p.selling_price*v_qty,2));
    update products set stock = stock - v_qty where id=p.id returning stock into v_new;
    insert into stock_movements (product_id, type, quantity, balance_after, reference, user_id)
    values (p.id, 'sale', -v_qty, v_new, v_sale_no, v_uid);
  end loop;

  insert into sale_payments (sale_id, method, currency, amount)
  select v_sale_id, x->>'method', x->>'currency', (x->>'amount')::numeric from jsonb_array_elements(p_payments) x;

  return jsonb_build_object('id', v_sale_id, 'sale_number', v_sale_no, 'total', v_total, 'change', v_change, 'rate', v_rate, 'shift_id', v_shift);
end $$;

-- Cash refunds come out of the refunder's open shift drawer (if any)
create or replace function public.refund_sale(p_sale uuid, p_items jsonb, p_reason text, p_method text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_sale record; it jsonb; si record; v_qty numeric; v_amt numeric := 0; v_new numeric; v_left numeric; v_shift uuid;
begin
  if not public.can_refund(v_uid) then raise exception 'Only a supervisor or manager can process refunds'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'A reason is required'; end if;
  select * into v_sale from sales where id = p_sale for update;
  if not found then raise exception 'Sale not found'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'quantity')::numeric;
    if v_qty <= 0 then continue; end if;
    select * into si from sale_items where id = (it->>'sale_item_id')::uuid and sale_id = p_sale for update;
    if not found then raise exception 'Item not on this sale'; end if;
    if v_qty > si.quantity - si.refunded_qty then raise exception 'Cannot refund more than was sold for %', si.name; end if;
    update sale_items set refunded_qty = refunded_qty + v_qty where id = si.id;
    v_amt := v_amt + round(si.unit_price * v_qty, 2);
    if si.product_id is not null then
      update products set stock = stock + v_qty where id = si.product_id returning stock into v_new;
      insert into stock_movements (product_id, type, quantity, balance_after, reference, note, user_id)
      values (si.product_id, 'return', v_qty, v_new, v_sale.sale_number, p_reason, v_uid);
    end if;
  end loop;
  if v_amt = 0 then raise exception 'Choose at least one item to refund'; end if;
  if v_sale.subtotal > 0 then v_amt := round(v_amt * v_sale.total / v_sale.subtotal, 2); end if;
  select id into v_shift from cashier_shifts where cashier_id = v_uid and status = 'open';
  if v_shift is null then
    select id into v_shift from cashier_shifts where id = v_sale.shift_id and status = 'open';
  end if;
  insert into refunds (sale_id, amount, reason, method, refunded_by, shift_id) values (p_sale, v_amt, p_reason, coalesce(p_method,'cash'), v_uid, v_shift);
  select sum(quantity - refunded_qty) into v_left from sale_items where sale_id = p_sale;
  update sales set status = case when v_left <= 0 then 'refunded' else 'partially_refunded' end where id = p_sale;
  return jsonb_build_object('amount', v_amt);
end $$;

revoke execute on function public.open_shift(numeric,numeric) from anon, public;
revoke execute on function public.record_cash_movement(text,text,numeric,text) from anon, public;
revoke execute on function public.shift_summary(uuid) from anon, public;
revoke execute on function public.close_shift(numeric,numeric,text) from anon, public;
grant execute on function public.open_shift(numeric,numeric) to authenticated;
grant execute on function public.record_cash_movement(text,text,numeric,text) to authenticated;
grant execute on function public.shift_summary(uuid) to authenticated;
grant execute on function public.close_shift(numeric,numeric,text) to authenticated;