CREATE EXTENSION IF NOT EXISTS pg_cron;

ALTER TABLE public.daily_settlements ADD COLUMN IF NOT EXISTS auto boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.auto_close_daily_settlements(p_day date DEFAULT ((now() AT TIME ZONE 'Africa/Harare')::date - 1))
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  INSERT INTO public.daily_settlements (store_id, day, lines, notes, settled_by, settled_at, auto)
  SELECT st.id, p_day, '[]'::jsonb, 'Auto-closed at midnight from till records and shift close counts — waiting for manager approval.',
         (SELECT m.user_id FROM public.store_memberships m WHERE m.store_id = st.id ORDER BY m.created_at LIMIT 1), now(), true
  FROM public.stores st
  WHERE EXISTS (SELECT 1 FROM public.sales s WHERE s.store_id = st.id
                  AND s.created_at >= (p_day::timestamp AT TIME ZONE 'Africa/Harare')
                  AND s.created_at <  ((p_day + 1)::timestamp AT TIME ZONE 'Africa/Harare'))
    AND EXISTS (SELECT 1 FROM public.store_memberships m WHERE m.store_id = st.id)
  ON CONFLICT (store_id, day) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.auto_close_daily_settlements(date) FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('auto-close-daily-settlements', '10 22 * * *', $$SELECT public.auto_close_daily_settlements();$$);