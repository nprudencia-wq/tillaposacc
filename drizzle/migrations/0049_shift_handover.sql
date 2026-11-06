ALTER TABLE public.cashier_shifts ADD COLUMN IF NOT EXISTS manager_notes text, ADD COLUMN IF NOT EXISTS handover_summary text, ADD COLUMN IF NOT EXISTS handover_by uuid, ADD COLUMN IF NOT EXISTS handover_at timestamptz;
CREATE OR REPLACE FUNCTION public.save_shift_handover(p_shift uuid, p_notes text, p_summary text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT (public.can_refund(auth.uid()) OR public.can_post_expense(auth.uid())) THEN RAISE EXCEPTION 'Only managers or supervisors can write handover notes'; END IF;
  UPDATE public.cashier_shifts SET manager_notes=nullif(trim(p_notes),''), handover_summary=nullif(trim(p_summary),''), handover_by=auth.uid(), handover_at=now()
   WHERE id=p_shift AND store_id=public.current_store_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.save_shift_handover(uuid,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_shift_handover(uuid,text,text) TO authenticated;