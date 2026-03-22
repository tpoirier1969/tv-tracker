create extension if not exists pgcrypto;

create table if not exists public.tvt_workspaces (
  slug text primary key,
  label text,
  created_at timestamptz not null default now()
);

create table if not exists public.tvt_users (
  id text primary key,
  workspace_slug text not null references public.tvt_workspaces(slug) on delete cascade,
  name text not null,
  color text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tvt_users_workspace_idx
  on public.tvt_users (workspace_slug, sort_order, created_at);

create table if not exists public.tvt_shows (
  id text primary key,
  workspace_slug text not null references public.tvt_workspaces(slug) on delete cascade,
  source text not null,
  tmdb_id bigint,
  tvmaze_id bigint,
  name text not null,
  premiered text,
  watched jsonb not null default '{}'::jsonb,
  assigned_user_ids jsonb not null default '[]'::jsonb,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tvt_shows_workspace_tmdb_uidx
  on public.tvt_shows (workspace_slug, tmdb_id)
  where tmdb_id is not null;

create index if not exists tvt_shows_workspace_idx
  on public.tvt_shows (workspace_slug, added_at desc);

alter table public.tvt_workspaces enable row level security;
alter table public.tvt_users enable row level security;
alter table public.tvt_shows enable row level security;

drop policy if exists "public read write workspaces" on public.tvt_workspaces;
create policy "public read write workspaces"
  on public.tvt_workspaces
  for all
  using (true)
  with check (true);

drop policy if exists "public read write users" on public.tvt_users;
create policy "public read write users"
  on public.tvt_users
  for all
  using (true)
  with check (true);

drop policy if exists "public read write shows" on public.tvt_shows;
create policy "public read write shows"
  on public.tvt_shows
  for all
  using (true)
  with check (true);
