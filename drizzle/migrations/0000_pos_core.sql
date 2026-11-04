create type public.app_role as enum ('admin','owner','manager','supervisor','cashier','stock_controller','accountant');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id=_user_id and role=_role)
$$;
create or replace function public.can_manage_stock(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id=_user_id and role in ('admin','owner','manager','stock_controller'))
$$;
create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id=_user_id)
$$;

create policy "staff read profiles" on public.profiles for select to authenticated using (public.is_staff(auth.uid()) or id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());
create policy "read own roles or admin" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'owner'));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  if not exists (select 1 from public.user_roles) then
    insert into public.user_roles (user_id, role) values (new.id, 'owner');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'cashier');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'My Store',
  zig_rate numeric(14,4) not null default 26.80,
  vat_rate numeric(5,2) not null default 15.00,
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1);
grant select, update on public.settings to authenticated;
grant all on public.settings to service_role;
alter table public.settings enable row level security;
create policy "staff read settings" on public.settings for select to authenticated using (public.is_staff(auth.uid()));
create policy "managers update settings" on public.settings for update to authenticated using (public.can_manage_stock(auth.uid()));

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.categories to authenticated;
grant all on public.categories to service_role;
alter table public.categories enable row level security;
create policy "staff read categories" on public.categories for select to authenticated using (public.is_staff(auth.uid()));
create policy "managers write categories" on public.categories for all to authenticated using (public.can_manage_stock(auth.uid())) with check (public.can_manage_stock(auth.uid()));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text unique,
  barcode text unique,
  description text,
  category_id uuid references public.categories(id) on delete set null,
  image_url text,
  cost_price numeric(14,2) not null default 0,
  selling_price numeric(14,2) not null default 0,
  wholesale_price numeric(14,2) not null default 0,
  stock numeric(14,3) not null default 0,
  min_stock numeric(14,3) not null default 0,
  max_stock numeric(14,3) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "staff read products" on public.products for select to authenticated using (public.is_staff(auth.uid()));
create policy "managers insert products" on public.products for insert to authenticated with check (public.can_manage_stock(auth.uid()));
create policy "managers update products" on public.products for update to authenticated using (public.can_manage_stock(auth.uid()));

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  type text not null check (type in ('opening','sale','purchase','adjustment','damaged','expired','return')),
  quantity numeric(14,3) not null,
  balance_after numeric(14,3) not null,
  reference text,
  note text,
  user_id uuid,
  created_at timestamptz not null default now()
);
grant select on public.stock_movements to authenticated;
grant all on public.stock_movements to service_role;
alter table public.stock_movements enable row level security;
create policy "staff read movements" on public.stock_movements for select to authenticated using (public.is_staff(auth.uid()));

create sequence public.sale_number_seq start 1001;
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_number text not null unique default ('TXN-' || nextval('public.sale_number_seq')),
  cashier_id uuid not null,
  subtotal numeric(14,2) not null,
  discount numeric(14,2) not null default 0,
  total numeric(14,2) not null,
  currency text not null check (currency in ('USD','ZiG')),
  exchange_rate numeric(14,4) not null default 1,
  amount_paid numeric(14,2) not null,
  change_given numeric(14,2) not null default 0,
  status text not null default 'completed' check (status in ('completed','refunded')),
  created_at timestamptz not null default now()
);
grant select on public.sales to authenticated;
grant all on public.sales to service_role;
alter table public.sales enable row level security;
create policy "staff read sales" on public.sales for select to authenticated using (public.is_staff(auth.uid()));

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  quantity numeric(14,3) not null,
  unit_price numeric(14,2) not null,
  cost_price numeric(14,2) not null default 0,
  line_total numeric(14,2) not null
);
grant select on public.sale_items to authenticated;
grant all on public.sale_items to service_role;
alter table public.sale_items enable row level security;
create policy "staff read sale items" on public.sale_items for select to authenticated using (public.is_staff(auth.uid()));

create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  method text not null check (method in ('cash','mobile_money','bank_transfer','card')),
  currency text not null check (currency in ('USD','ZiG')),
  amount numeric(14,2) not null
);
grant select on public.sale_payments to authenticated;
grant all on public.sale_payments to service_role;
alter table public.sale_payments enable row level security;
create policy "staff read payments" on public.sale_payments for select to authenticated using (public.is_staff(auth.uid()));

-- Complete a sale atomically. Prices come from the DB (cashiers can't override).
-- p_items: [{product_id, quantity}], p_payments: [{method,currency,amount}]
-- p_discount is in USD.
create or replace function public.complete_sale(p_items jsonb, p_payments jsonb, p_discount numeric, p_currency text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_rate numeric;
  v_sale_id uuid; v_sale_no text;
  v_sub numeric := 0; v_total numeric; v_paid numeric := 0; v_change numeric;
  it jsonb; p record; v_qty numeric; v_new numeric; pay jsonb;
begin
  if not public.is_staff(v_uid) then raise exception 'Not authorised'; end if;
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
  v_total := v_sub - p_discount; -- USD

  for pay in select * from jsonb_array_elements(p_payments) loop
    v_paid := v_paid + case when pay->>'currency'='ZiG' then (pay->>'amount')::numeric / v_rate else (pay->>'amount')::numeric end;
  end loop;
  if round(v_paid,2) < round(v_total,2) then raise exception 'Payment is less than total'; end if;
  v_change := round(v_paid - v_total, 2);

  insert into sales (cashier_id, subtotal, discount, total, currency, exchange_rate, amount_paid, change_given)
  values (v_uid, v_sub, p_discount, v_total, p_currency, v_rate, round(v_paid,2), v_change)
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

  return jsonb_build_object('id', v_sale_id, 'sale_number', v_sale_no, 'total', v_total, 'change', v_change, 'rate', v_rate);
end $$;

create or replace function public.adjust_stock(p_product uuid, p_qty numeric, p_type text, p_note text)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_new numeric;
begin
  if not public.can_manage_stock(auth.uid()) then raise exception 'Not authorised'; end if;
  if p_type not in ('opening','purchase','adjustment','damaged','expired','return') then raise exception 'Bad type'; end if;
  update products set stock = stock + p_qty where id=p_product returning stock into v_new;
  if not found then raise exception 'Product not found'; end if;
  insert into stock_movements (product_id, type, quantity, balance_after, note, user_id)
  values (p_product, p_type, p_qty, v_new, p_note, auth.uid());
  return v_new;
end $$;

revoke execute on function public.complete_sale(jsonb,jsonb,numeric,text) from anon, public;
revoke execute on function public.adjust_stock(uuid,numeric,text,text) from anon, public;
grant execute on function public.complete_sale(jsonb,jsonb,numeric,text) to authenticated;
grant execute on function public.adjust_stock(uuid,numeric,text,text) to authenticated;

insert into public.categories (name) values ('Beverages'),('Beer & Spirits'),('Groceries'),('Meat'),('Household');
insert into public.products (name, sku, barcode, category_id, cost_price, selling_price, wholesale_price, stock, min_stock) values
('Coca-Cola 500ml','BEV-001','6001067001234',(select id from categories where name='Beverages'),0.45,0.80,0.70,120,24),
('Mazoe Orange 2L','BEV-002','6001067002231',(select id from categories where name='Beverages'),2.10,3.20,2.90,40,10),
('Bottled Water 500ml','BEV-003','6001067003238',(select id from categories where name='Beverages'),0.20,0.50,0.40,200,48),
('Castle Lager 340ml','BRS-001','6001108001112',(select id from categories where name='Beer & Spirits'),0.70,1.20,1.00,240,48),
('Zambezi Lager 375ml','BRS-002','6001108002119',(select id from categories where name='Beer & Spirits'),0.75,1.30,1.10,180,48),
('Chibuku Super 1.25L','BRS-003','6001108003116',(select id from categories where name='Beer & Spirits'),0.55,1.00,0.85,8,24),
('Gordon''s Gin 750ml','BRS-004','5000289020701',(select id from categories where name='Beer & Spirits'),9.00,14.00,12.50,15,5),
('Mealie Meal 10kg','GRO-001','6009880001018',(select id from categories where name='Groceries'),5.80,8.50,7.80,60,15),
('Cooking Oil 2L','GRO-002','6009880002015',(select id from categories where name='Groceries'),3.40,5.00,4.60,35,10),
('White Sugar 2kg','GRO-003','6009880003012',(select id from categories where name='Groceries'),1.90,2.80,2.50,4,12),
('Bread Loaf','GRO-004','6009880004019',(select id from categories where name='Groceries'),0.80,1.20,1.05,30,10),
('Beef Stewing 1kg','MEA-001','2000000000017',(select id from categories where name='Meat'),4.50,7.00,6.20,25,5),
('Chicken Pieces 2kg','MEA-002','2000000000024',(select id from categories where name='Meat'),5.00,7.50,6.80,18,5),
('Boerewors 1kg','MEA-003','2000000000031',(select id from categories where name='Meat'),5.20,8.00,7.20,12,5),
('Sunlight Soap 500g','HOU-001','6001087001010',(select id from categories where name='Household'),0.90,1.50,1.30,50,10),
('Toilet Paper 9-pack','HOU-002','6001087002017',(select id from categories where name='Household'),3.00,4.80,4.30,22,6);
insert into public.stock_movements (product_id, type, quantity, balance_after, note)
select id, 'opening', stock, stock, 'Opening stock' from public.products;