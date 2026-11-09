DROP INDEX IF EXISTS public.branches_one_main;
CREATE UNIQUE INDEX branches_one_main ON public.branches (store_id) WHERE is_main;