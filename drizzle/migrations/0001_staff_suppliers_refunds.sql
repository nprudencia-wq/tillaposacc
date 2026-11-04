create or replace function public.is_owner_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id=_user_id and role in ('admin','owner'))
$$;
create or replace function public.can_refund(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id=_user_id and role in ('admin','owner','manager','supervisor'))
$$;

create or replace function public.set_user_role(p_user uuid, p_role app_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner_admin(auth.uid()) then raise exception 'Only the owner or administrator can change roles'; end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own role'; end if;
  delete from user_roles where user_id = p_user;
  insert into user_roles (user_id, role) values (p_user, p_role);
end $$;
revoke execute on function public.set_user_role(uuid, app_role) from anon, public;
grant execute on function public.set_user_role(uuid, app_role) to authenticated;

-- Suppliers
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.suppliers to authenticated;
grant all on public.suppliers to service_role;
alter table public.suppliers enable row level security;
create policy "staff read suppliers" on public.suppliers for select to authenticated using (public.is_staff(auth.uid()));
create policy "managers insert suppliers" on public.suppliers for insert to authenticated with check (public.can_manage_stock(auth.uid()));
create policy "managers update suppliers" on public.suppliers for update to authenticated using (public.can_manage_stock(auth.uid()));

create sequence public.grn_number_seq start 1001;
create table public.grns (
  id uuid primary key default gen_random_uuid(),
  grn_number text not null unique default ('GRN-' || nextval('public.grn_number_seq')),
  supplier_id uuid not null references public.suppliers(id),
  invoice_number text,
  total numeric(14,2) not null,
  note text,
  received_by uuid not null,
  created_at timestamptz not null default now()
);
grant select on public.grns to authenticated;
grant all on public.grns to service_role;
alter table public.grns enable row level security;
create policy "staff read grns" on public.grns for select to authenticated using (public.is_staff(auth.uid()));

create table public.grn_items (
  id uuid primary key default gen_random_uuid(),
  grn_id uuid not null references public.grns(id) on delete cascade,
  product_id uuid not null references public.products(id),
  name text not null,
  quantity numeric(14,3) not null,
  unit_cost numeric(14,2) not null,
  line_total numeric(14,2) not null
);
grant select on public.grn_items to authenticated;
grant all on public.grn_items to service_role;
alter table public.grn_items enable row level security;
create policy "staff read grn items" on public.grn_items for select to authenticated using (public.is_staff(auth.uid()));

create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  amount numeric(14,2) not null,
  method text not null,
  reference text,
  paid_by uuid not null,
  created_at timestamptz not null default now()
);
grant select on public.supplier_payments to authenticated;
grant all on public.supplier_payments to service_role;
alter table public.supplier_payments enable row level security;
create policy "staff read supplier payments" on public.supplier_payments for select to authenticated using (public.is_staff(auth.uid()));

create or replace function public.receive_goods(p_supplier uuid, p_invoice text, p_items jsonb, p_paid numeric, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_no text; v_total numeric := 0; it jsonb; p record; v_qty numeric; v_cost numeric; v_new numeric;
begin
  if not public.can_manage_stock(v_uid) then raise exception 'Not authorised'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Add at least one item'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'quantity')::numeric; v_cost := (it->>'unit_cost')::numeric;
    if v_qty <= 0 or v_cost < 0 then raise exception 'Invalid quantity or cost'; end if;
    v_total := v_total + round(v_qty * v_cost, 2);
  end loop;
  insert into grns (supplier_id, invoice_number, total, note, received_by) values (p_supplier, p_invoice, v_total, p_note, v_uid)
  returning id, grn_number into v_id, v_no;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into p from products where id = (it->>'product_id')::uuid for update;
    if not found then raise exception 'Product not found'; end if;
    v_qty := (it->>'quantity')::numeric; v_cost := (it->>'unit_cost')::numeric;
    insert into grn_items (grn_id, product_id, name, quantity, unit_cost, line_total) values (v_id, p.id, p.name, v_qty, v_cost, round(v_qty*v_cost,2));
    update products set stock = stock + v_qty, cost_price = v_cost where id = p.id returning stock into v_new;
    insert into stock_movements (product_id, type, quantity, balance_after, reference, user_id) values (p.id, 'purchase', v_qty, v_new, v_no, v_uid);
  end loop;
  if coalesce(p_paid,0) > 0 then
    insert into supplier_payments (supplier_id, amount, method, reference, paid_by) values (p_supplier, p_paid, 'cash', v_no, v_uid);
  end if;
  return jsonb_build_object('id', v_id, 'grn_number', v_no, 'total', v_total);
end $$;

create or replace function public.pay_supplier(p_supplier uuid, p_amount numeric, p_method text, p_reference text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.can_manage_stock(auth.uid()) or public.has_role(auth.uid(),'accountant')) then raise exception 'Not authorised'; end if;
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  insert into supplier_payments (supplier_id, amount, method, reference, paid_by) values (p_supplier, p_amount, p_method, p_reference, auth.uid());
end $$;

-- Refunds
alter table public.sale_items add column refunded_qty numeric(14,3) not null default 0;
alter table public.sales drop constraint if exists sales_status_check;
alter table public.sales add constraint sales_status_check check (status in ('completed','partially_refunded','refunded'));

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id),
  amount numeric(14,2) not null,
  reason text not null,
  method text not null default 'cash',
  refunded_by uuid not null,
  created_at timestamptz not null default now()
);
grant select on public.refunds to authenticated;
grant all on public.refunds to service_role;
alter table public.refunds enable row level security;
create policy "staff read refunds" on public.refunds for select to authenticated using (public.is_staff(auth.uid()));

create or replace function public.refund_sale(p_sale uuid, p_items jsonb, p_reason text, p_method text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_sale record; it jsonb; si record; v_qty numeric; v_amt numeric := 0; v_new numeric; v_left numeric;
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
  -- scale by discount share
  if v_sale.subtotal > 0 then v_amt := round(v_amt * v_sale.total / v_sale.subtotal, 2); end if;
  insert into refunds (sale_id, amount, reason, method, refunded_by) values (p_sale, v_amt, p_reason, coalesce(p_method,'cash'), v_uid);
  select sum(quantity - refunded_qty) into v_left from sale_items where sale_id = p_sale;
  update sales set status = case when v_left <= 0 then 'refunded' else 'partially_refunded' end where id = p_sale;
  return jsonb_build_object('amount', v_amt);
end $$;

revoke execute on function public.receive_goods(uuid,text,jsonb,numeric,text) from anon, public;
revoke execute on function public.pay_supplier(uuid,numeric,text,text) from anon, public;
revoke execute on function public.refund_sale(uuid,jsonb,text,text) from anon, public;
grant execute on function public.receive_goods(uuid,text,jsonb,numeric,text) to authenticated;
grant execute on function public.pay_supplier(uuid,numeric,text,text) to authenticated;
grant execute on function public.refund_sale(uuid,jsonb,text,text) to authenticated;