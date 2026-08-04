create table if not exists public.umpdl_profiles (
  profile_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.umpdl_profiles enable row level security;

create index if not exists umpdl_profiles_updated_at_idx
on public.umpdl_profiles(updated_at);

-- Privacy migration: remove any history accidentally written by older clients.
update public.umpdl_profiles
set payload = (coalesce(payload, '{}'::jsonb) - 'history' - 'playbackPositions')
where payload ? 'history' or payload ? 'playbackPositions';

-- Anonymous community learning store.
-- It intentionally has no profile_id, page URL, title, watch history, cookie,
-- IP or executable code. Only aggregate votes for safe host rules/TMDB ids are
-- kept so the bookmarklet can quietly improve ad blocking and ranking.
create table if not exists public.umpdl_learning (
  kind text not null check (kind in ('video', 'iframe', 'ad', 'tmdb')),
  subject text not null,
  up_votes integer not null default 0 check (up_votes >= 0),
  down_votes integer not null default 0 check (down_votes >= 0),
  updated_at timestamptz not null default now(),
  primary key (kind, subject)
);

alter table public.umpdl_learning enable row level security;

create index if not exists umpdl_learning_ad_rules_idx
on public.umpdl_learning(kind, down_votes desc, updated_at desc)
where kind = 'ad';

-- The Render service calls this RPC with its Supabase service role. Increment
-- atomically so concurrent anonymous votes cannot overwrite one another.
create or replace function public.umpdl_apply_learning_vote(
  p_kind text,
  p_subject text,
  p_vote text
)
returns table(kind text, subject text, up_votes integer, down_votes integer, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind not in ('video', 'iframe', 'ad', 'tmdb') or p_vote not in ('up', 'down') or length(coalesce(p_subject, '')) = 0 then
    raise exception 'invalid learning vote';
  end if;

  insert into public.umpdl_learning (kind, subject, up_votes, down_votes, updated_at)
  values (
    p_kind,
    p_subject,
    case when p_vote = 'up' then 1 else 0 end,
    case when p_vote = 'down' then 1 else 0 end,
    now()
  )
  on conflict (kind, subject) do update
  set up_votes = public.umpdl_learning.up_votes + case when p_vote = 'up' then 1 else 0 end,
      down_votes = public.umpdl_learning.down_votes + case when p_vote = 'down' then 1 else 0 end,
      updated_at = now();

  return query
  select l.kind, l.subject, l.up_votes, l.down_votes, l.updated_at
  from public.umpdl_learning l
  where l.kind = p_kind and l.subject = p_subject;
end;
$$;

revoke all on table public.umpdl_learning from anon, authenticated;
revoke all on function public.umpdl_apply_learning_vote(text, text, text) from public;
grant select, insert, update on table public.umpdl_learning to service_role;
grant execute on function public.umpdl_apply_learning_vote(text, text, text) to service_role;
