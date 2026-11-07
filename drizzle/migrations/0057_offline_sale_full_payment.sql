CREATE OR REPLACE FUNCTION public.complete_offline_sale(p_client_ref text, p_items jsonb, p_payments jsonb, p_discount numeric, p_currency text, p_sold_at timestamp with time zone, p_shift uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_rate numeric; v_rand numeric; v_shift uuid; v_opened timestamptz; v_existing record;
  v_sale_id uuid; v_sale_no text; v_sub numeric := 0; v_total numeric; v_paid numeric := 0; v_change numeric;
  it jsonb; p record; v_qty numeric; v_new numeric; v_when timestamptz; v_price numeric; v_cost numeric;
begin
  if not public.is_staff(v_uid) then raise exception 'Not authorised'; end if;
  if coalesce(p_client_ref,'') = '' then raise exception 'Missing offline reference'; end if;
  PERFORM pg_advisory_xact_lock(hashtextextended(public.current_store_id()::text || ':' || auth.uid()::text || ':' || p_client_ref,0)); select id, sale_number into v_existing from sales where client_ref = p_client_ref and store_id=public.current_store_id() and cashier_id=auth.uid();
  if found then return jsonb_build_object('id', v_existing.id, 'sale_number', v_existing.sale_number, 'duplicate', true); end if;
  select id, opened_at into v_shift, v_opened from cashier_shifts where id = p_shift and cashier_id = v_uid;
  if v_shift is null then select id, opened_at into v_shift, v_opened from cashier_shifts where cashier_id = v_uid and status='open'; end if;
  if v_shift is null then raise exception 'No shift found for this offline sale'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Cart is empty'; end if;
  v_when := least(greatest(coalesce(p_sold_at, now()), v_opened), now());
  select zig_rate,rand_rate into v_rate,v_rand from rate_history where store_id=public.current_store_id() and effective_from <= v_when order by effective_from desc limit 1;
  if v_rate is null then select zig_rate,rand_rate into v_rate,v_rand from settings where store_id=public.current_store_id(); end if; PERFORM public.currency_rate(p_currency,v_rate,v_rand); IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payments) x WHERE public.is_account_method(x->>'method')) THEN RAISE EXCEPTION 'Account sales require online checkout'; END IF;
  create temp table if not exists _offline_lines (product_id uuid, name text, qty numeric, price numeric, cost numeric) on commit drop;
  truncate _offline_lines;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into p from products where id=(it->>'product_id')::uuid and store_id=public.current_store_id() and active for update;
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
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payments) x WHERE coalesce((x->>'amount')::numeric,0) < 0) THEN RAISE EXCEPTION 'Payment amounts cannot be negative'; END IF;
  select coalesce(sum((x->>'amount')::numeric / public.currency_rate(x->>'currency',v_rate,v_rand)),0)
    into v_paid from jsonb_array_elements(p_payments) x;
  IF round(v_paid, 2) < round(v_total, 2) THEN RAISE EXCEPTION 'Offline sale is not fully paid'; END IF;
  v_change := greatest(round(v_paid - v_total, 2), 0);
  insert into sales (cashier_id, subtotal, discount, total, currency, exchange_rate, amount_paid, change_given, shift_id, created_at, client_ref, offline, synced_at,zig_rate,rand_rate)
  values (v_uid, v_sub, v_sub - v_total, v_total, p_currency, CASE WHEN p_currency='ZAR' THEN v_rand ELSE v_rate END, round(v_paid,2), v_change, v_shift, v_when, p_client_ref, true, now(),v_rate,v_rand)
  returning id, sale_number into v_sale_id, v_sale_no;
  for p in select * from _offline_lines loop
    insert into sale_items (sale_id, product_id, name, quantity, unit_price, cost_price, line_total)
    values (v_sale_id, p.product_id, p.name, p.qty, p.price, p.cost, round(p.price*p.qty,2));
    update products set stock = stock - p.qty where id=p.product_id returning stock into v_new;
    insert into stock_movements (product_id, type, quantity, balance_after, reference, note, user_id)
    values (p.product_id, 'sale', -p.qty, v_new, v_sale_no, 'Offline sale ' || p_client_ref, v_uid);
  end loop;
  insert into sale_payments (sale_id, method, currency, amount, verified,exchange_rate)
  select v_sale_id, x->>'method', x->>'currency', (x->>'amount')::numeric, public.is_cash_method(x->>'method'),public.currency_rate(x->>'currency',v_rate,v_rand) from jsonb_array_elements(p_payments) x;
  return jsonb_build_object('id', v_sale_id, 'sale_number', v_sale_no, 'total', v_total, 'rate', CASE WHEN p_currency='ZAR' THEN v_rand ELSE v_rate END, 'underpaid', false);
end $function$;