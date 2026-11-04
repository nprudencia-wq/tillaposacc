alter table public.sale_items add column if not exists original_price numeric(14,2);

CREATE OR REPLACE FUNCTION public.role_allows(_user_id uuid, _perm text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select exists (select 1 from user_roles where user_id=_user_id and role::text = any (case _perm
    when 'give_discount' then array['admin','owner','manager','supervisor','cashier']
    when 'refund' then array['admin','owner','manager','supervisor']
    when 'manage_stock' then array['admin','owner','manager','stock_controller']
    when 'post_expense' then array['admin','owner','manager','accountant']
    when 'view_reports' then array['admin','owner','manager','accountant']
    when 'override_price' then array['admin','owner','manager','supervisor']
    else array[]::text[] end))
$function$;

CREATE OR REPLACE FUNCTION public.complete_sale(p_items jsonb, p_payments jsonb, p_discount numeric, p_currency text, p_customer uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_rate numeric; v_shift uuid;
  v_sale_id uuid; v_sale_no text;
  v_sub numeric := 0; v_total numeric; v_paid numeric := 0; v_change numeric; v_on_acc numeric := 0;
  it jsonb; p record; v_qty numeric; v_new numeric; pay jsonb; c record; v_amt numeric; v_price numeric;
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
    v_price := coalesce((it->>'price')::numeric, p.selling_price);
    if v_price <> p.selling_price then
      if not public.has_permission(v_uid, 'override_price') then raise exception 'You are not allowed to change prices'; end if;
      if v_price < 0 then raise exception 'Price cannot be negative'; end if;
    end if;
    v_sub := v_sub + round(v_price * v_qty, 2);
  end loop;

  if p_discount < 0 or p_discount > v_sub then raise exception 'Invalid discount'; end if;
  v_total := v_sub - p_discount;

  for pay in select * from jsonb_array_elements(p_payments) loop
    v_amt := case when pay->>'currency'='ZiG' then (pay->>'amount')::numeric / v_rate else (pay->>'amount')::numeric end;
    v_paid := v_paid + v_amt;
    if public.is_account_method(pay->>'method') then v_on_acc := v_on_acc + v_amt; end if;
  end loop;
  if round(v_paid,2) < round(v_total,2) then raise exception 'Payment is less than total'; end if;
  v_change := round(v_paid - v_total, 2);

  if v_on_acc > 0 then
    if p_customer is null then raise exception 'Choose a customer to put this sale on account'; end if;
    select * into c from customers where id = p_customer and active;
    if not found then raise exception 'Customer not found or switched off'; end if;
    if v_change > 0 then raise exception 'An on-account sale cannot give change'; end if;
    if c.credit_limit > 0 and public.customer_balance(p_customer) + v_on_acc > c.credit_limit + 0.005 then
      raise exception 'This would take % over their credit limit of $%', c.name, c.credit_limit;
    end if;
  end if;

  insert into sales (cashier_id, subtotal, discount, total, currency, exchange_rate, amount_paid, change_given, shift_id, customer_id)
  values (v_uid, v_sub, p_discount, v_total, p_currency, v_rate, round(v_paid,2), v_change, v_shift, p_customer)
  returning id, sale_number into v_sale_id, v_sale_no;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into p from products where id=(it->>'product_id')::uuid;
    v_qty := (it->>'quantity')::numeric;
    v_price := coalesce((it->>'price')::numeric, p.selling_price);
    insert into sale_items (sale_id, product_id, name, quantity, unit_price, cost_price, line_total, original_price)
    values (v_sale_id, p.id, p.name, v_qty, v_price, p.cost_price, round(v_price*v_qty,2), case when v_price <> p.selling_price then p.selling_price end);
    update products set stock = stock - v_qty where id=p.id returning stock into v_new;
    insert into stock_movements (product_id, type, quantity, balance_after, reference, user_id)
    values (p.id, 'sale', -v_qty, v_new, v_sale_no, v_uid);
  end loop;

  insert into sale_payments (sale_id, method, currency, amount)
  select v_sale_id, x->>'method', x->>'currency', (x->>'amount')::numeric from jsonb_array_elements(p_payments) x;

  return jsonb_build_object('id', v_sale_id, 'sale_number', v_sale_no, 'total', v_total, 'change', v_change, 'rate', v_rate, 'shift_id', v_shift);
end $function$;