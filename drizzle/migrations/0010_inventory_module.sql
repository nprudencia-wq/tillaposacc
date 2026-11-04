alter table public.categories add column if not exists parent_id uuid references public.categories(id) on delete set null;

do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid='public.stock_movements'::regclass and contype='c' loop
    execute format('alter table public.stock_movements drop constraint %I', c);
  end loop;
end $$;
alter table public.stock_movements add constraint stock_movements_type_check check (type in ('opening','sale','purchase','adjustment','damaged','expired','return','refund','transfer_out','transfer_in','supplier_return','stocktake'));
alter table public.stock_movements add column if not exists branch_id uuid;

-- Branches: the main branch is products.stock; other branches hold stock in branch_stock
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_main boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.branches to authenticated;
grant all on public.branches to service_role;
alter table public.branches enable row level security;
create policy "staff read branches" on public.branches for select to authenticated using (public.is_staff(auth.uid()));
insert into public.branches (name, is_main) values ('Main shop', true);
create unique index branches_one_main on public.branches (is_main) where is_main;

create table public.branch_stock (
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric(14,3) not null default 0,
  primary key (branch_id, product_id)
);
grant select on public.branch_stock to authenticated;
grant all on public.branch_stock to service_role;
alter table public.branch_stock enable row level security;
create policy "staff read branch stock" on public.branch_stock for select to authenticated using (public.is_staff(auth.uid()));

create sequence public.transfer_number_seq start 1001;
create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_number text not null unique default 'TR-' || nextval('public.transfer_number_seq'),
  from_branch uuid not null references public.branches(id),
  to_branch uuid not null references public.branches(id),
  note text,
  items jsonb not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
grant select on public.stock_transfers to authenticated;
grant all on public.stock_transfers to service_role;
alter table public.stock_transfers enable row level security;
create policy "staff read transfers" on public.stock_transfers for select to authenticated using (public.is_staff(auth.uid()));

create sequence public.supplier_return_seq start 1001;
create table public.supplier_returns (
  id uuid primary key default gen_random_uuid(),
  return_number text not null unique default 'RTN-' || nextval('public.supplier_return_seq'),
  supplier_id uuid not null references public.suppliers(id),
  reason text not null,
  total numeric(14,2) not null default 0,
  items jsonb not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
grant select on public.supplier_returns to authenticated;
grant all on public.supplier_returns to service_role;
alter table public.supplier_returns enable row level security;
create policy "staff read supplier returns" on public.supplier_returns for select to authenticated using (public.is_staff(auth.uid()));

create sequence public.stocktake_seq start 1001;
create table public.stocktakes (
  id uuid primary key default gen_random_uuid(),
  stocktake_number text not null unique default 'ST-' || nextval('public.stocktake_seq'),
  category_id uuid references public.categories(id) on delete set null,
  status text not null default 'counting' check (status in ('counting','completed','cancelled')),
  note text,
  started_by uuid not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
grant select on public.stocktakes to authenticated;
grant all on public.stocktakes to service_role;
alter table public.stocktakes enable row level security;
create policy "staff read stocktakes" on public.stocktakes for select to authenticated using (public.is_staff(auth.uid()));

create table public.stocktake_items (
  stocktake_id uuid not null references public.stocktakes(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  system_qty numeric(14,3) not null,
  counted_qty numeric(14,3),
  unit_cost numeric(14,2) not null default 0,
  primary key (stocktake_id, product_id)
);
grant select on public.stocktake_items to authenticated;
grant all on public.stocktake_items to service_role;
alter table public.stocktake_items enable row level security;
create policy "staff read stocktake items" on public.stocktake_items for select to authenticated using (public.is_staff(auth.uid()));

-- RPCs
create or replace function public.save_branch(p_id uuid, p_name text, p_active boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not public.can_manage_stock(auth.uid()) then raise exception 'Not authorised'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Name is required'; end if;
  if p_id is null then insert into branches(name) values (trim(p_name)) returning id into v;
  else update branches set name=trim(p_name), active = case when is_main then true else p_active end where id=p_id returning id into v; end if;
  return v;
end $$;

create or replace function public.transfer_stock(p_from uuid, p_to uuid, p_items jsonb, p_note text) returns text
language plpgsql security definer set search_path = public as $$
declare it jsonb; v_pid uuid; v_qty numeric; v_from_main boolean; v_to_main boolean; v_have numeric; v_num text; v_name text; v_items jsonb := '[]';
begin
  if not public.can_manage_stock(auth.uid()) then raise exception 'Not authorised'; end if;
  if p_from = p_to then raise exception 'Choose two different branches'; end if;
  select is_main into v_from_main from branches where id=p_from; if not found then raise exception 'Branch not found'; end if;
  select is_main into v_to_main from branches where id=p_to; if not found then raise exception 'Branch not found'; end if;
  if jsonb_array_length(coalesce(p_items,'[]')) = 0 then raise exception 'Add at least one product'; end if;
  insert into stock_transfers(from_branch,to_branch,note,items,created_by) values (p_from,p_to,p_note,'[]',auth.uid()) returning transfer_number into v_num;
  for it in select * from jsonb_array_elements(p_items) loop
    v_pid := (it->>'product_id')::uuid; v_qty := (it->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Quantities must be above zero'; end if;
    select name into v_name from products where id=v_pid; if not found then raise exception 'Product not found'; end if;
    if v_from_main then
      update products set stock = stock - v_qty where id=v_pid returning stock into v_have;
    else
      update branch_stock set quantity = quantity - v_qty where branch_id=p_from and product_id=v_pid returning quantity into v_have;
      if not found then v_have := -v_qty; end if;
    end if;
    if v_have < 0 then raise exception 'Not enough % at the sending branch', v_name; end if;
    insert into stock_movements(product_id,type,quantity,balance_after,reference,note,user_id,branch_id) values (v_pid,'transfer_out',-v_qty,v_have,v_num,p_note,auth.uid(),p_from);
    if v_to_main then
      update products set stock = stock + v_qty where id=v_pid returning stock into v_have;
    else
      insert into branch_stock(branch_id,product_id,quantity) values (p_to,v_pid,v_qty)
      on conflict (branch_id,product_id) do update set quantity = branch_stock.quantity + excluded.quantity returning quantity into v_have;
    end if;
    insert into stock_movements(product_id,type,quantity,balance_after,reference,note,user_id,branch_id) values (v_pid,'transfer_in',v_qty,v_have,v_num,p_note,auth.uid(),p_to);
    v_items := v_items || jsonb_build_object('product_id',v_pid,'name',v_name,'quantity',v_qty);
  end loop;
  update stock_transfers set items=v_items where transfer_number=v_num;
  return v_num;
end $$;

create or replace function public.return_to_supplier(p_supplier uuid, p_items jsonb, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare it jsonb; v_pid uuid; v_qty numeric; v_cost numeric; v_have numeric; v_name text; v_num text; v_total numeric := 0; v_items jsonb := '[]';
begin
  if not public.can_manage_stock(auth.uid()) then raise exception 'Not authorised'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Give a reason'; end if;
  perform 1 from suppliers where id=p_supplier; if not found then raise exception 'Supplier not found'; end if;
  if jsonb_array_length(coalesce(p_items,'[]')) = 0 then raise exception 'Add at least one product'; end if;
  insert into supplier_returns(supplier_id,reason,items,created_by) values (p_supplier,p_reason,'[]',auth.uid()) returning return_number into v_num;
  for it in select * from jsonb_array_elements(p_items) loop
    v_pid := (it->>'product_id')::uuid; v_qty := (it->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Quantities must be above zero'; end if;
    update products set stock = stock - v_qty where id=v_pid returning stock, cost_price, name into v_have, v_cost, v_name;
    if not found then raise exception 'Product not found'; end if;
    if v_have < 0 then raise exception 'Not enough % in stock to return', v_name; end if;
    insert into stock_movements(product_id,type,quantity,balance_after,reference,note,user_id) values (v_pid,'supplier_return',-v_qty,v_have,v_num,p_reason,auth.uid());
    v_total := v_total + round(v_qty*v_cost,2);
    v_items := v_items || jsonb_build_object('product_id',v_pid,'name',v_name,'quantity',v_qty,'unit_cost',v_cost);
  end loop;
  update supplier_returns set items=v_items, total=v_total where return_number=v_num;
  return v_num;
end $$;

create or replace function public.start_stocktake(p_category uuid, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not public.can_manage_stock(auth.uid()) then raise exception 'Not authorised'; end if;
  if exists (select 1 from stocktakes where status='counting') then raise exception 'Finish the stocktake already in progress first'; end if;
  insert into stocktakes(category_id,note,started_by) values (p_category,p_note,auth.uid()) returning id into v;
  insert into stocktake_items(stocktake_id,product_id,name,system_qty,unit_cost)
  select v, id, name, stock, cost_price from products where active and (p_category is null or category_id=p_category or category_id in (select id from categories where parent_id=p_category));
  return v;
end $$;

create or replace function public.record_count(p_stocktake uuid, p_product uuid, p_qty numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_stock(auth.uid()) then raise exception 'Not authorised'; end if;
  if not exists (select 1 from stocktakes where id=p_stocktake and status='counting') then raise exception 'Stocktake is closed'; end if;
  if p_qty is not null and p_qty < 0 then raise exception 'Count cannot be negative'; end if;
  update stocktake_items set counted_qty=p_qty where stocktake_id=p_stocktake and product_id=p_product;
end $$;

-- Applies the variance against stock as counted at start, plus any sales since (delta approach)
create or replace function public.finish_stocktake(p_stocktake uuid, p_apply boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_num text; v_new numeric;
begin
  if not public.can_manage_stock(auth.uid()) then raise exception 'Not authorised'; end if;
  select stocktake_number into v_num from stocktakes where id=p_stocktake and status='counting' for update;
  if not found then raise exception 'Stocktake is closed'; end if;
  if p_apply then
    for r in select * from stocktake_items where stocktake_id=p_stocktake and counted_qty is not null and counted_qty <> system_qty loop
      update products set stock = stock + (r.counted_qty - r.system_qty) where id=r.product_id returning stock into v_new;
      insert into stock_movements(product_id,type,quantity,balance_after,reference,note,user_id) values (r.product_id,'stocktake',r.counted_qty - r.system_qty,v_new,v_num,'Stocktake variance',auth.uid());
    end loop;
  end if;
  update stocktakes set status = case when p_apply then 'completed' else 'cancelled' end, completed_at=now() where id=p_stocktake;
end $$;

revoke execute on function public.save_branch(uuid,text,boolean), public.transfer_stock(uuid,uuid,jsonb,text), public.return_to_supplier(uuid,jsonb,text), public.start_stocktake(uuid,text), public.record_count(uuid,uuid,numeric), public.finish_stocktake(uuid,boolean) from anon, public;
grant execute on function public.save_branch(uuid,text,boolean), public.transfer_stock(uuid,uuid,jsonb,text), public.return_to_supplier(uuid,jsonb,text), public.start_stocktake(uuid,text), public.record_count(uuid,uuid,numeric), public.finish_stocktake(uuid,boolean) to authenticated;