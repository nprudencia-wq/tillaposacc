
CREATE TABLE public.staff_pay_profiles (
  store_id uuid NOT NULL DEFAULT public.current_store_id() REFERENCES public.stores(id),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  basic_salary numeric NOT NULL DEFAULT 0 CHECK (basic_salary >= 0),
  allowances numeric NOT NULL DEFAULT 0 CHECK (allowances >= 0),
  nssa_exempt boolean NOT NULL DEFAULT false,
  paye_exempt boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, user_id)
);
CREATE TABLE public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL DEFAULT public.current_store_id() REFERENCES public.stores(id),
  period date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized')),
  journal_number text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  UNIQUE (store_id, period)
);
CREATE TABLE public.payroll_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  store_id uuid NOT NULL DEFAULT public.current_store_id() REFERENCES public.stores(id),
  user_id uuid NOT NULL,
  name text NOT NULL,
  basic numeric NOT NULL DEFAULT 0,
  allowances numeric NOT NULL DEFAULT 0,
  bonus numeric NOT NULL DEFAULT 0,
  gross numeric NOT NULL DEFAULT 0,
  nssa_employee numeric NOT NULL DEFAULT 0,
  nssa_employer numeric NOT NULL DEFAULT 0,
  paye numeric NOT NULL DEFAULT 0,
  aids_levy numeric NOT NULL DEFAULT 0,
  advances numeric NOT NULL DEFAULT 0,
  net numeric NOT NULL DEFAULT 0,
  UNIQUE (run_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_pay_profiles, public.payroll_runs, public.payroll_lines TO authenticated;
GRANT ALL ON public.staff_pay_profiles, public.payroll_runs, public.payroll_lines TO service_role;
ALTER TABLE public.staff_pay_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll managers manage pay profiles" ON public.staff_pay_profiles FOR ALL TO authenticated
  USING (store_id = public.current_store_id() AND public.can_manage_staff(auth.uid()))
  WITH CHECK (store_id = public.current_store_id() AND public.can_manage_staff(auth.uid())
    AND EXISTS (SELECT 1 FROM public.store_memberships m WHERE m.user_id = staff_pay_profiles.user_id AND m.store_id = staff_pay_profiles.store_id));
CREATE POLICY "payroll managers read runs" ON public.payroll_runs FOR SELECT TO authenticated
  USING (store_id = public.current_store_id() AND public.can_manage_staff(auth.uid()));
CREATE POLICY "payroll managers create draft runs" ON public.payroll_runs FOR INSERT TO authenticated
  WITH CHECK (store_id = public.current_store_id() AND public.can_manage_staff(auth.uid()) AND status = 'draft' AND journal_number IS NULL);
CREATE POLICY "payroll managers delete draft runs" ON public.payroll_runs FOR DELETE TO authenticated
  USING (store_id = public.current_store_id() AND public.can_manage_staff(auth.uid()) AND status = 'draft');
CREATE POLICY "payroll managers read lines" ON public.payroll_lines FOR SELECT TO authenticated
  USING (store_id = public.current_store_id() AND public.can_manage_staff(auth.uid()));
CREATE POLICY "payroll managers write draft lines" ON public.payroll_lines FOR ALL TO authenticated
  USING (store_id = public.current_store_id() AND public.can_manage_staff(auth.uid())
    AND EXISTS (SELECT 1 FROM public.payroll_runs r WHERE r.id = run_id AND r.status = 'draft' AND r.store_id = payroll_lines.store_id))
  WITH CHECK (store_id = public.current_store_id() AND public.can_manage_staff(auth.uid())
    AND EXISTS (SELECT 1 FROM public.payroll_runs r WHERE r.id = run_id AND r.status = 'draft' AND r.store_id = payroll_lines.store_id)
    AND EXISTS (SELECT 1 FROM public.store_memberships m WHERE m.user_id = payroll_lines.user_id AND m.store_id = payroll_lines.store_id));

CREATE OR REPLACE FUNCTION public.finalize_payroll_run(p_run uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.payroll_runs; v_store uuid := public.current_store_id(); v_id uuid; v_no text;
  g numeric; ne numeric; nr numeric; tx numeric; adv numeric; net numeric; v_date date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_staff(auth.uid()) THEN RAISE EXCEPTION 'Only an owner, administrator or manager can finalise payroll'; END IF;
  SELECT * INTO r FROM public.payroll_runs WHERE id = p_run AND store_id = v_store FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pay run not found'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'This pay run is already finalised'; END IF;
  SELECT coalesce(sum(gross),0), coalesce(sum(nssa_employee),0), coalesce(sum(nssa_employer),0), coalesce(sum(paye+aids_levy),0), coalesce(sum(advances),0), coalesce(sum(net),0)
    INTO g, ne, nr, tx, adv, net FROM public.payroll_lines WHERE run_id = p_run AND store_id = v_store;
  IF g <= 0 THEN RAISE EXCEPTION 'The pay run has no pay to finalise'; END IF;
  IF round(g - ne - tx - adv, 2) <> round(net, 2) THEN RAISE EXCEPTION 'Pay run totals do not add up; recalculate it'; END IF;
  INSERT INTO public.gl_accounts(store_id, code, name, type, system, active) VALUES
    (v_store,'6050','Salaries & wages','expense',true,true), (v_store,'6060','Employer NSSA','expense',true,true),
    (v_store,'2200','PAYE & AIDS levy payable','liability',true,true), (v_store,'2210','NSSA payable','liability',true,true)
  ON CONFLICT DO NOTHING;
  v_date := least((r.period + interval '1 month' - interval '1 day')::date, current_date);
  INSERT INTO public.journal_entries(entry_date, memo, posted_by, store_id) VALUES (v_date, 'Payroll ' || to_char(r.period,'Mon YYYY'), auth.uid(), v_store) RETURNING id, journal_number INTO v_id, v_no;
  INSERT INTO public.journal_lines(entry_id, account_code, debit, credit, store_id)
  SELECT v_id, a, round(d,2), round(c,2), v_store FROM (VALUES
    ('6050', g, 0::numeric), ('6060', nr, 0), ('2200', 0, tx), ('2210', 0, ne + nr), ('1160', 0, adv), ('1000', 0, net)) x(a,d,c)
  WHERE round(d,2) > 0 OR round(c,2) > 0;
  UPDATE public.payroll_runs SET status = 'finalized', finalized_at = now(), journal_number = v_no WHERE id = p_run;
  RETURN v_no;
END $$;
REVOKE ALL ON FUNCTION public.finalize_payroll_run(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_payroll_run(uuid) TO authenticated;
