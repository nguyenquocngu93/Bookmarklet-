create table if not exists public.umpdl_profiles (
  profile_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.umpdl_profiles enable row level security;

create index if not exists umpdl_profiles_updated_at_idx
on public.umpdl_profiles(updated_at);
