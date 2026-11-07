CREATE OR REPLACE FUNCTION public.role_allows(_user_id uuid, _perm text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select exists (select 1 from user_roles where user_id=_user_id and role::text = any (case
    when _perm like 'report\_%' then array['admin','owner','manager','accountant']
    else case _perm
    when 'give_discount' then array['admin','owner','manager','supervisor']
    when 'refund' then array['admin','owner','manager','supervisor']
    when 'manage_stock' then array['admin','owner','manager','stock_controller']
    when 'post_expense' then array['admin','owner','manager','accountant']
    when 'view_reports' then array['admin','owner','manager','accountant']
    when 'override_price' then array['admin','owner','manager','supervisor']
    when 'module_dashboard' then array['admin','owner','manager','supervisor','accountant','stock_controller']
    when 'module_inventory' then array['admin','owner','manager','stock_controller']
    when 'module_stock' then array['admin','owner','manager','stock_controller']
    when 'module_suppliers' then array['admin','owner','manager','stock_controller','accountant']
    when 'module_sales' then array['admin','owner','manager','supervisor','accountant']
    when 'module_documents' then array['admin','owner','manager','supervisor','accountant']
    when 'module_customers' then array['admin','owner','manager','supervisor','accountant']
    when 'module_staff' then array['admin','owner','manager']
    when 'module_shifts' then array['admin','owner','manager','supervisor']
    when 'module_expenses' then array['admin','owner','manager','accountant']
    when 'module_accounting' then array['admin','owner','manager','accountant']
    when 'module_settings' then array['admin','owner','manager']
    else array[]::text[] end end))
$function$;