-- Deposits are liabilities rather than sales, but their physical cash must reconcile to the drawer count.
DO $$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public.auto_close_daily_settlements(date)'::regprocedure);
  d := replace(d,
    'AND NOT (type = ''paid_in'' AND coalesce(reason,'''') LIKE ''Debt payment from%'') AND coalesce(reason,'''') NOT LIKE ''Bottle deposit%''',
    'AND NOT (type = ''paid_in'' AND coalesce(reason,'''') LIKE ''Debt payment from%'')');
  IF position('Bottle deposit' in d) > 0 THEN
    RAISE EXCEPTION 'Could not remove the bottle-deposit cash exclusion';
  END IF;
  EXECUTE d;
END $$;
REVOKE ALL ON FUNCTION public.auto_close_daily_settlements(date) FROM PUBLIC, anon, authenticated;