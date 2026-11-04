alter table public.settings
  add column if not exists address text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists email text not null default '',
  add column if not exists tax_number text not null default '',
  add column if not exists receipt_footer text not null default 'Thank you for shopping with us!',
  add column if not exists logo_url text not null default '';