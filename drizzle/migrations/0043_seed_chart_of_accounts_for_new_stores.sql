CREATE OR REPLACE FUNCTION public.seed_store_accounts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.gl_accounts (store_id, code, name, type, system, active)
  SELECT NEW.id, v.code, v.name, v.type, true, true FROM (VALUES
    ('1000','Cash on hand','asset'),('1010','Bank & mobile money','asset'),('1100','Debtors (customers)','asset'),
    ('1150','Allowance for doubtful debts','asset'),('1200','Stock (inventory)','asset'),
    ('2000','Creditors (suppliers)','liability'),('2100','VAT payable','liability'),
    ('3000','Owner''s capital','equity'),('3100','Retained earnings','equity'),('3200','Owner''s drawings','equity'),
    ('4000','Sales','income'),('4100','Sales discounts','income'),('4200','Sales returns','income'),
    ('4300','Other income','income'),('4400','Interest income','income'),
    ('5000','Cost of sales','expense'),('5100','Stock losses & write-offs','expense'),
    ('6000','Operating expenses','expense'),('6100','Debts written off','expense'),('6200','Bad debt provision','expense')
  ) v(code,name,type)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.seed_store_accounts() FROM public, anon, authenticated;
CREATE TRIGGER seed_store_accounts AFTER INSERT ON public.stores FOR EACH ROW EXECUTE FUNCTION public.seed_store_accounts();