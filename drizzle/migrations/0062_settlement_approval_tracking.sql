ALTER TABLE public.daily_settlements ADD COLUMN approved_by uuid;
ALTER TABLE public.daily_settlements ADD COLUMN approved_at timestamptz;
COMMENT ON COLUMN public.daily_settlements.approved_by IS 'Manager who approved an auto-settled day; null for manual settlements.';
COMMENT ON COLUMN public.daily_settlements.approved_at IS 'When an auto-settled day was approved by a manager.';