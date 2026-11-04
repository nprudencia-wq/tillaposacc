alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists active boolean not null default true;
update public.profiles p set username = lower(regexp_replace(split_part(u.email,'@',1), '[^a-zA-Z0-9._-]', '', 'g')) || case when (select count(*) from auth.users u2 where split_part(u2.email,'@',1) = split_part(u.email,'@',1)) > 1 then '-' || left(p.id::text, 4) else '' end
from auth.users u where u.id = p.id and p.username is null;
create unique index if not exists profiles_username_key on public.profiles (lower(username));

create table public.user_permissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission text not null check (permission in ('give_discount','refund','manage_stock','post_expense','view_reports')),
  allowed boolean not null,
  primary key (user_id, permission));
grant select on public.user_permissions to authenticated;
grant all on public.user_permissions to service_role;
alter table public.user_permissions enable row level security;
create policy "staff read permissions" on public.user_permissions for select to authenticated using (user_id = auth.uid() or public.is_staff(auth.uid()));

create or replace function public.role_allows(_user_id uuid, _perm text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id=_user_id and role::text = any (case _perm
    when 'give_discount' then array['admin','owner','manager','supervisor','cashier']
    when 'refund' then array['admin','owner','manager','supervisor']
    when 'manage_stock' then array['admin','owner','manager','stock_controller']
    when 'post_expense' then array['admin','owner','manager','accountant']
    when 'view_reports' then array['admin','owner','manager','accountant']
    else array[]::text[] end))
$$;
create or replace function public.has_permission(_user_id uuid, _perm text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select allowed from user_permissions where user_id=_user_id and permission=_perm),
                  public.role_allows(_user_id, _perm))
    and coalesce((select active from profiles where id=_user_id), true)
$$;
create or replace function public.can_manage_stock(_user_id uuid) returns boolean language sql stable security definer set search_path = public as $$ select public.has_permission(_user_id, 'manage_stock') $$;
create or replace function public.can_refund(_user_id uuid) returns boolean language sql stable security definer set search_path = public as $$ select public.has_permission(_user_id, 'refund') $$;
create or replace function public.can_post_expense(_user_id uuid) returns boolean language sql stable security definer set search_path = public as $$ select public.has_permission(_user_id, 'post_expense') $$;
create or replace function public.is_staff(_user_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id=_user_id) and coalesce((select active from profiles where id=_user_id), true)
$$;
create or replace function public.can_manage_staff(_user_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff(_user_id) and exists (select 1 from user_roles where user_id=_user_id and role in ('admin','owner','manager'))
$$;

create or replace function public.set_user_permission(p_user uuid, p_perm text, p_allowed boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_staff(auth.uid()) then raise exception 'Only an owner, administrator or manager can change access rights'; end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own access rights'; end if;
  if not public.is_owner_admin(auth.uid()) and exists (select 1 from user_roles where user_id=p_user and role in ('admin','owner','manager')) then
    raise exception 'Managers can only change access for their staff'; end if;
  if p_allowed is null then delete from user_permissions where user_id=p_user and permission=p_perm;
  else insert into user_permissions values (p_user, p_perm, p_allowed) on conflict (user_id, permission) do update set allowed = excluded.allowed; end if;
end $$;
revoke all on function public.set_user_permission(uuid,text,boolean) from public, anon;
grant execute on function public.set_user_permission(uuid,text,boolean) to authenticated;

create or replace function public.set_user_active(p_user uuid, p_active boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_staff(auth.uid()) then raise exception 'Not allowed'; end if;
  if p_user = auth.uid() then raise exception 'You cannot disable your own account'; end if;
  if not public.is_owner_admin(auth.uid()) and exists (select 1 from user_roles where user_id=p_user and role in ('admin','owner','manager')) then
    raise exception 'Managers can only disable their staff'; end if;
  update profiles set active = p_active where id = p_user;
end $$;
revoke all on function public.set_user_active(uuid,boolean) from public, anon;
grant execute on function public.set_user_active(uuid,boolean) to authenticated;

create or replace function public.set_user_role(p_user uuid, p_role app_role) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_staff(auth.uid()) then raise exception 'Only an owner, administrator or manager can change roles'; end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own role'; end if;
  if not public.is_owner_admin(auth.uid()) and (p_role in ('admin','owner','manager')
     or exists (select 1 from user_roles where user_id=p_user and role in ('admin','owner','manager'))) then
    raise exception 'Managers can only assign staff roles below manager'; end if;
  delete from user_roles where user_id = p_user;
  insert into user_roles (user_id, role) values (p_user, p_role);
end $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare v_role text := new.raw_app_meta_data->>'initial_role';
begin
  insert into public.profiles (id, full_name, username) values (new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1)),
    lower(coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1)) ));
  if not exists (select 1 from public.user_roles) then
    insert into public.user_roles (user_id, role) values (new.id, 'owner');
  elsif v_role is not null then
    insert into public.user_roles (user_id, role) values (new.id, v_role::app_role);
  else
    insert into public.user_roles (user_id, role) values (new.id, 'cashier');
  end if;
  return new;
end $$;

create or replace function public.enforce_discount_permission() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.discount > 0 and not public.has_permission(new.cashier_id, 'give_discount') then
    raise exception 'You are not allowed to give discounts'; end if;
  return new;
end $$;
create trigger sales_discount_permission before insert on public.sales for each row execute function public.enforce_discount_permission();