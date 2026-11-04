alter table public.sales add column if not exists client_ref text unique;
alter table public.sales add column if not exists offline boolean not null default false;
alter table public.sales add column if not exists synced_at timestamptz;
alter table public.sale_payments add column if not exists verified boolean not null default true;

create or replace function public.complete_offline_sale(p_client_ref text, p_items jsonb, p_payments jsonb, p_discount numeric, p_currency text, p_sold_at timestamptz, p_shift uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_rate numeric; v_shift uuid; v_existing record;
  v_sale_id uuid; v_sale_no text; v_sub numeric := 0; v_total numeric; v_paid numeric := 0; v_change numeric;
  it jsonb; p record; v_qty numeric; v_new numeric; pay jsonb; v_when timestamptz;
begin
  if not public.is_staff(v_uid) then raise exception 'Not authorised'; end if;
  if coalesce(p_client_ref,'') = '' then raise exception 'Missing offline reference'; end if;
  select id, sale_number into v_existing from sales where client_ref = p_client_ref;
  if found then return jsonb_build_object('id', v_existing.id, 'sale_number', v_existing.sale_number, 'duplicate', true); end if;
  select id into v_shift from cashier_shifts where id = p_shift and cashier_id = v_uid;
  if v_shift is null then select id into v_shift from cashier_shifts where cashier_id = v_uid and status='open'; end if;
  if v_shift is null then raise exception 'No shift found for this offline sale'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Cart is empty'; end if;
  v_when := least(coalesce(p_sold_at, now()), now());
  select zig_rate into v_rate from settings where id=1;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into p from products where id=(it->>'product_id')::uuid for update;
    if not found then raise exception 'Product not found'; end if;
    v_qty := (it->>'quantity')::numeric;
    if v_qty <= 0 then raise exception 'Invalid quantity'; end if;
    v_sub := v_sub + round(p.selling_price * v_qty, 2);
  end loop;
  v_total := v_sub - least(greatest(coalesce(p_discount,0),0), v_sub);
  for pay in select * from jsonb_array_elements(p_payments) loop
    v_paid := v_paid + case when pay->>'currency'='ZiG' then (pay->>'amount')::numeric / v_rate else (pay->>'amount')::numeric end;
  end loop;
  v_change := greatest(round(v_paid - v_total, 2), 0);
  insert into sales (cashier_id, subtotal, discount, total, currency, exchange_rate, amount_paid, change_given, shift_id, created_at, client_ref, offline, synced_at)
  values (v_uid, v_sub, v_sub - v_total, v_total, p_currency, v_rate, round(v_paid,2), v_change, v_shift, v_when, p_client_ref, true, now())
  returning id, sale_number into v_sale_id, v_sale_no;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into p from products where id=(it->>'product_id')::uuid;
    v_qty := (it->>'quantity')::numeric;
    insert into sale_items (sale_id, product_id, name, quantity, unit_price, cost_price, line_total)
    values (v_sale_id, p.id, p.name, v_qty, p.selling_price, p.cost_price, round(p.selling_price*v_qty,2));
    update products set stock = stock - v_qty where id=p.id returning stock into v_new;
    insert into stock_movements (product_id, type, quantity, balance_after, reference, note, user_id)
    values (p.id, 'sale', -v_qty, v_new, v_sale_no, 'Offline sale', v_uid);
  end loop;
  insert into sale_payments (sale_id, method, currency, amount, verified)
  select v_sale_id, x->>'method', x->>'currency', (x->>'amount')::numeric, (x->>'method') = 'cash' from jsonb_array_elements(p_payments) x;
  return jsonb_build_object('id', v_sale_id, 'sale_number', v_sale_no, 'total', v_total, 'underpaid', round(v_paid,2) < round(v_total,2));
end $$;

create or replace function public.verify_payment(p_payment uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_refund(auth.uid()) then raise exception 'Only a supervisor or manager can verify payments'; end if;
  update sale_payments set verified = true where id = p_payment;
end $$;

revoke all on function public.complete_offline_sale(text,jsonb,jsonb,numeric,text,timestamptz,uuid) from public, anon;
grant execute on function public.complete_offline_sale(text,jsonb,jsonb,numeric,text,timestamptz,uuid) to authenticated;
revoke all on function public.verify_payment(uuid) from public, anon;
grant execute on function public.verify_payment(uuid) to authenticated;