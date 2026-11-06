ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS vat_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS prices_include_vat boolean NOT NULL DEFAULT true;
ALTER TABLE public.settings ADD CONSTRAINT settings_vat_rate_range CHECK (vat_rate >= 0 AND vat_rate <= 100) NOT VALID;