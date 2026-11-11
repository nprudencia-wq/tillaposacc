DO $$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public.gl_lines(date)'::regprocedure);
  d := replace(d, 'public.currency_rate(m.currency)', '(SELECT CASE m.currency WHEN ''ZiG'' THEN st.zig_rate ELSE st.rand_rate END FROM public.settings st WHERE st.store_id=m.store_id LIMIT 1)');
  EXECUTE d;
END $$;