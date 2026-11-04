ALTER TABLE public.payment_types ADD COLUMN is_account boolean NOT NULL DEFAULT false;

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  address text,
  credit_limit numeric NOT NULL DEFAULT 0,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read customers" ON public.customers FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff add customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "managers edit customers" ON public.customers FOR UPDATE TO authenticated USING (public.can_manage_payment_types(auth.uid())) WITH CHECK (public.can_manage_payment_types(auth.uid()));

ALTER TABLE public.sales ADD COLUMN customer_id uuid REFERENCES public.customers(id);
CREATE INDEX sales_customer_idx ON public.sales(customer_id);

CREATE TABLE public.customer_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text NOT NULL DEFAULT ('RCPT-' || floor(extract(epoch from clock_timestamp())*1000)::text),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  original_amount numeric NOT NULL,
  exchange_rate numeric NOT NULL DEFAULT 1,
  method text NOT NULL,
  reference text,
  shift_id uuid REFERENCES public.cashier_shifts(id),
  received_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.customer_payments TO authenticated;
GRANT ALL ON public.customer_payments TO service_role;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read customer payments" ON public.customer_payments FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.is_account_method(p text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select coalesce((select is_account from payment_types where code = p), false)
$$;

-- What a customer owes in USD: on-account sale payments minus repayments.
CREATE OR REPLACE FUNCTION public.customer_balance(p_customer uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select round(coalesce((
    select sum(case when sp.currency='ZiG' then sp.amount / nullif(s.exchange_rate,0) else sp.amount end)
    from sale_payments sp join sales s on s.id = sp.sale_id
    where s.customer_id = p_customer and public.is_account_method(sp.method)), 0)
  - coalesce((select sum(amount) from customer_payments where customer_id = p_customer), 0)
  - coalesce((select sum(r.amount) from refunds r join sales s on s.id = r.sale_id
      where s.customer_id = p_customer and public.is_account_method(r.method)), 0), 2)
$$;

DROP FUNCTION public.complete_sale(jsonb, jsonb, numeric, text);
CREATE FUNCTION public.complete_sale(p_items jsonb, p_payments jsonb, p_discount numeric, p_currency text, p_customer uuid DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_rate numeric; v_shift uuid;
  v_sale_id uuid; v_sale_no text;
  v_sub numeric := 0; v_total numeric; v_paid numeric := 0; v_change numeric; v_on_acc numeric := 0;
  it jsonb; p record; v_qty numeric; v_new numeric; pay jsonb; c record; v_amt numeric;
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
    insert into sale_items (sale_id, product_id, name, quantity, unit_price, cost_price, line_total)
    values (v_sale_id, p.id, p.name, v_qty, p.selling_price, p.cost_price, round(p.selling_price*v_qty,2));
    update products set stock = stock - v_qty where id=p.id returning stock into v_new;
    insert into stock_movements (product_id, type, quantity, balance_after, reference, user_id)
    values (p.id, 'sale', -v_qty, v_new, v_sale_no, v_uid);
  end loop;

  insert into sale_payments (sale_id, method, currency, amount)
  select v_sale_id, x->>'method', x->>'currency', (x->>'amount')::numeric from jsonb_array_elements(p_payments) x;

  return jsonb_build_object('id', v_sale_id, 'sale_number', v_sale_no, 'total', v_total, 'change', v_change, 'rate', v_rate, 'shift_id', v_shift);
end $function$;
GRANT EXECUTE ON FUNCTION public.complete_sale(jsonb, jsonb, numeric, text, uuid) TO authenticated;

-- Customer pays off debt. Cash goes into the receiver's open shift as money paid in, so the cash-up stays right.
CREATE OR REPLACE FUNCTION public.receive_customer_payment(p_customer uuid, p_amount numeric, p_currency text, p_method text, p_reference text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare v_uid uuid := auth.uid(); v_rate numeric; v_usd numeric; v_shift uuid; v_id uuid; v_name text;
begin
  if not public.is_staff(v_uid) then raise exception 'Not authorised'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount above zero'; end if;
  select name into v_name from customers where id = p_customer;
  if v_name is null then raise exception 'Customer not found'; end if;
  if not exists (select 1 from payment_types where code = p_method and not is_account) then raise exception 'Unknown payment type: %', p_method; end if;
  select zig_rate into v_rate from settings where id = 1;
  v_usd := round(case when p_currency = 'ZiG' then p_amount / v_rate else p_amount end, 2);
  if public.is_cash_method(p_method) then
    select id into v_shift from cashier_shifts where cashier_id = v_uid and status = 'open';
    if v_shift is null then raise exception 'Open a shift to take cash from a customer'; end if;
    insert into shift_cash_movements (shift_id, type, currency, amount, reason, user_id)
    values (v_shift, 'paid_in', p_currency, p_amount, 'Debt payment from ' || v_name, v_uid);
  end if;
  insert into customer_payments (customer_id, amount, currency, original_amount, exchange_rate, method, reference, shift_id, received_by)
  values (p_customer, v_usd, coalesce(p_currency,'USD'), p_amount, case when p_currency='ZiG' then v_rate else 1 end, p_method, p_reference, v_shift, v_uid)
  returning id into v_id;
  return v_id;
end $$;
GRANT EXECUTE ON FUNCTION public.receive_customer_payment(uuid, numeric, text, text, text) TO authenticated;