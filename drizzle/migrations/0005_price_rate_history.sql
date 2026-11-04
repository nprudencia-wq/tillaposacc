create table public.price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  selling_price numeric not null, cost_price numeric not null,
  effective_from timestamptz not null default now());
create index price_history_lookup on public.price_history(product_id, effective_from desc);
grant select on public.price_history to authenticated;
grant all on public.price_history to service_role;
alter table public.price_history enable row level security;
create policy "staff read price history" on public.price_history for select to authenticated using (public.is_staff(auth.uid()));

create table public.rate_history (
  id uuid primary key default gen_random_uuid(),
  zig_rate numeric not null, effective_from timestamptz not null default now());
create index rate_history_lookup on public.rate_history(effective_from desc);
grant select on public.rate_history to authenticated;
grant all on public.rate_history to service_role;
alter table public.rate_history enable row level security;
create policy "staff read rate history" on public.rate_history for select to authenticated using (public.is_staff(auth.uid()));

insert into public.price_history (product_id, selling_price, cost_price, effective_from)
select id, selling_price, cost_price, '-infinity' from public.products;
insert into public.rate_history (zig_rate, effective_from) select zig_rate, '-infinity' from public.settings where id=1;

create or replace function public.log_price_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.selling_price is distinct from old.selling_price or new.cost_price is distinct from old.cost_price then
    insert into price_history (product_id, selling_price, cost_price) values (new.id, new.selling_price, new.cost_price);
  end if;
  return new;
end $$;
create trigger products_price_history after insert or update on public.products for each row execute function public.log_price_change();

create or replace function public.log_rate_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.zig_rate is distinct from old.zig_rate then insert into rate_history (zig_rate) values (new.zig_rate); end if;
  return new;
end $$;
create trigger settings_rate_history after update on public.settings for each row execute function public.log_rate_change();

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
  -- The sale time can't predate its shift or be in the future, so old prices can't be picked arbitrarily.
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
  select v_sale_id, x->>'method', x->>'currency', (x->>'amount')::numeric, (x->>'method') = 'cash' from jsonb_array_elements(p_payments) x;
  return jsonb_build_object('id', v_sale_id, 'sale_number', v_sale_no, 'total', v_total, 'rate', v_rate, 'underpaid', round(v_paid,2) < round(v_total,2));
end $$;