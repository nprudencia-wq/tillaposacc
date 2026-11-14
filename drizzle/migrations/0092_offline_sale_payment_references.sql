-- Preserve card/mobile approval references entered while the till was offline.
DO $$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public.complete_offline_sale_v2(text,jsonb,jsonb,numeric,text,timestamp with time zone,uuid,uuid)'::regprocedure);
  d := replace(d,
    'insert into sale_payments (sale_id, method, currency, amount, verified,exchange_rate)
  select v_sale_id, x->>''method'', x->>''currency'', (x->>''amount'')::numeric, public.is_cash_method(x->>''method''),public.currency_rate(x->>''currency'',v_rate,v_rand) from jsonb_array_elements(p_payments) x;',
    'insert into sale_payments (sale_id, method, currency, amount, verified,exchange_rate,reference)
  select v_sale_id, x->>''method'', x->>''currency'', (x->>''amount'')::numeric, public.is_cash_method(x->>''method''),public.currency_rate(x->>''currency'',v_rate,v_rand),
    CASE WHEN NOT public.is_cash_method(x->>''method'') THEN nullif(left(trim(x->>''reference''),80),'''') END
    from jsonb_array_elements(p_payments) x;');
  IF position('nullif(left(trim(x->>''reference''),80),'''')' in d) = 0 THEN
    RAISE EXCEPTION 'Could not add offline sale payment references';
  END IF;
  EXECUTE d;
END $$;