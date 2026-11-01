create table if not exists public.curator_settings (
  id text primary key default 'default',
  data jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.curator_settings (id, data)
values ('default', '{}'::jsonb)
on conflict (id) do nothing;