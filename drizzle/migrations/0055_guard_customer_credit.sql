create or replace function public.guard_customer_credit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.can_manage_payment_types(auth.uid()) then return new; end if;
  if tg_op = 'INSERT' then
    new.credit_limit := 0; new.active := false;
  else
    new.credit_limit := old.credit_limit; new.active := old.active;
  end if;
  return new;
end $$;
revoke execute on function public.guard_customer_credit() from public, anon, authenticated;
drop trigger if exists guard_customer_credit on public.customers;
create trigger guard_customer_credit before insert or update on public.customers
for each row execute function public.guard_customer_credit();