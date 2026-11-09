CREATE OR REPLACE FUNCTION public.auto_close_daily_settlements(p_day date DEFAULT ((now() AT TIME ZONE 'Africa/Harare')::date - 1))
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  st record; n integer := 0; v_start timestamptz; v_end timestamptz;
  v_cash text; v_cash_types int; v_shift_cash numeric; v_shifts int; v_zig numeric; v_zar numeric;
  v_lines jsonb; v_owed numeric; v_over numeric; v_note text;
BEGIN
  v_start := p_day::timestamp AT TIME ZONE 'Africa/Harare';
  v_end := (p_day + 1)::timestamp AT TIME ZONE 'Africa/Harare';
  FOR st IN
    SELECT s.id FROM public.stores s
    WHERE EXISTS (SELECT 1 FROM public.sales x WHERE x.store_id = s.id AND x.created_at >= v_start AND x.created_at < v_end)
      AND EXISTS (SELECT 1 FROM public.store_memberships m WHERE m.store_id = s.id)
      AND NOT EXISTS (SELECT 1 FROM public.daily_settlements d WHERE d.store_id = s.id AND d.day = p_day)
  LOOP
    SELECT code INTO v_cash FROM public.payment_types WHERE store_id = st.id AND is_cash ORDER BY sort_order LIMIT 1;
    v_cash := coalesce(v_cash, 'cash');
    SELECT count(*) INTO v_cash_types FROM public.payment_types WHERE store_id = st.id AND is_cash;
    SELECT coalesce(nullif(zig_rate,0),1), coalesce(nullif(rand_rate,0),1) INTO v_zig, v_zar FROM public.settings WHERE store_id = st.id;
    v_zig := coalesce(v_zig,1); v_zar := coalesce(v_zar,1);
    SELECT count(*), sum((coalesce(actual_cash_usd,0)-coalesce(opening_float_usd,0))
             + (coalesce(actual_cash_zig,0)-coalesce(opening_float_zig,0))/v_zig
             + (coalesce(actual_cash_zar,0)-coalesce(opening_float_zar,0))/v_zar)
      INTO v_shifts, v_shift_cash
      FROM public.cashier_shifts WHERE store_id = st.id AND status = 'closed' AND closed_at >= v_start AND closed_at < v_end;

    WITH sale_rows AS (
      SELECT sp.method, sum(sp.amount / coalesce(nullif(sp.exchange_rate,0),1)) AS usd
      FROM public.sale_payments sp JOIN public.sales s ON s.id = sp.sale_id
      WHERE s.store_id = st.id AND s.created_at >= v_start AND s.created_at < v_end
        AND s.status IN ('completed','refunded','partially_refunded')
      GROUP BY sp.method
      UNION ALL
      SELECT v_cash, -sum(coalesce(s.change_given,0)) FROM public.sales s
      WHERE s.store_id = st.id AND s.created_at >= v_start AND s.created_at < v_end
        AND s.status IN ('completed','refunded','partially_refunded')
    ), parts AS (
      SELECT method, usd AS sales, 0::numeric AS rep, 0::numeric AS ref, 0::numeric AS mov FROM sale_rows
      UNION ALL SELECT method, 0, amount, 0, 0 FROM public.customer_payments WHERE store_id = st.id AND created_at >= v_start AND created_at < v_end
      UNION ALL SELECT method, 0, 0, amount, 0 FROM public.refunds WHERE store_id = st.id AND created_at >= v_start AND created_at < v_end
      UNION ALL SELECT v_cash, 0, 0, 0, (CASE WHEN type = 'paid_in' THEN 1 ELSE -1 END) * amount /
          (CASE WHEN currency IN ('ZiG','ZIG') THEN v_zig WHEN currency = 'ZAR' THEN v_zar ELSE 1 END)
        FROM public.shift_cash_movements WHERE store_id = st.id AND created_at >= v_start AND created_at < v_end
          AND NOT (type = 'paid_in' AND coalesce(reason,'') LIKE 'Debt payment from%')
    ), rows AS (
      SELECT p.method, coalesce(pt.name, p.method) AS label,
        CASE WHEN pt.is_account THEN 'account' WHEN pt.is_cash OR (pt.code IS NULL AND p.method = 'cash') THEN 'cash' ELSE 'other' END AS grp,
        round(sum(p.sales + p.rep - p.ref + p.mov), 2) AS expected
      FROM parts p LEFT JOIN public.payment_types pt ON pt.store_id = st.id AND pt.code = p.method
      GROUP BY p.method, pt.name, pt.is_account, pt.is_cash, pt.code
    ), counted AS (
      SELECT *, CASE WHEN grp = 'cash' AND v_cash_types = 1 AND v_shifts > 0 THEN round(v_shift_cash, 2) ELSE expected END AS cnt FROM rows
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('method', method, 'label', label, 'group', grp, 'expected', expected,
             'counted', cnt, 'difference', round(cnt - expected, 2)) ORDER BY grp, label), '[]'::jsonb),
           coalesce(sum(cnt - expected), 0)
      INTO v_lines, v_over FROM counted;

    SELECT round(coalesce(sum(public.customer_balance(c.id)), 0), 2) INTO v_owed FROM public.customers c WHERE c.store_id = st.id AND c.active;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('method', '_owed', 'label', 'Total owed by customers', 'group', 'owed', 'expected', v_owed, 'counted', v_owed, 'difference', 0));
    v_note := format('Auto-settled at midnight. Cash counted from %s closed shift(s); card and mobile at till figures. Over/short: %s US$%s. Customers owed US$%s at close.',
      coalesce(v_shifts,0), CASE WHEN v_over < 0 THEN 'short' WHEN v_over > 0 THEN 'over' ELSE 'balanced' END, to_char(abs(round(v_over,2)), 'FM999999990.00'), to_char(v_owed, 'FM999999990.00'));

    INSERT INTO public.daily_settlements (store_id, day, lines, notes, settled_by, settled_at, auto)
    VALUES (st.id, p_day, v_lines, v_note, (SELECT m.user_id FROM public.store_memberships m WHERE m.store_id = st.id ORDER BY m.created_at LIMIT 1), now(), true)
    ON CONFLICT (store_id, day) DO NOTHING;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.auto_close_daily_settlements(date) FROM PUBLIC, anon, authenticated;