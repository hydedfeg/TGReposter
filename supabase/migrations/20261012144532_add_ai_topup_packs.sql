-- Phase 3: AI top-up product catalog. Nothing is published or charged.
create table public.billing_ai_topup_packs (
 id text primary key,
 label text not null,
 ai_units numeric(18,6) not null check (ai_units > 0),
 price_eur_cents integer not null check (price_eur_cents > 0),
 is_published boolean not null default false,
 created_at timestamptz not null default now()
);
insert into public.billing_ai_topup_packs(id,label,ai_units,price_eur_cents)
values ('ai_mini','AI Mini',500,700),
       ('ai_plus','AI Plus',2000,2500),
       ('ai_pro','AI Pro',5000,5500),
       ('ai_max','AI Max',10000,9900);
alter table public.billing_ai_topup_packs enable row level security;
revoke all on public.billing_ai_topup_packs from public,anon,authenticated;
grant select,insert,update,delete on public.billing_ai_topup_packs to service_role;