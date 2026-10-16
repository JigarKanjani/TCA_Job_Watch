alter table public.alerts
  add column windows  text[] not null default '{workday,weeknight,weekend_day}',
  add column timezone text   not null default 'America/Edmonton';
alter table public.alerts
  add constraint alerts_windows_valid check (
    cardinality(windows) >= 1
    and windows <@ array['weekday_morning','workday','weeknight','weekend_morning','weekend_day','night_owl','always']::text[]
  ),
  add constraint alerts_timezone_len check (char_length(timezone) between 1 and 64);

-- Paywall-ready: set only by a billing webhook (users can't write these columns).
alter table public.profiles
  add column plan                text not null default 'free' check (plan in ('free', 'pro')),
  add column plan_status         text check (plan_status in ('trialing','active','past_due','canceled')),
  add column plan_renews_at      timestamptz,
  add column billing_customer_id text unique;

create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind         text not null check (kind in ('resume', 'cover_letter')),
  name         text not null check (char_length(btrim(name)) between 1 and 120),
  storage_path text not null unique,
  size_bytes   integer check (size_bytes is null or size_bytes between 0 and 10485760),
  created_at   timestamptz not null default now()
);
create index documents_user_idx on public.documents (user_id, created_at desc);
alter table public.documents enable row level security;
create policy "documents_select_own" on public.documents for select to authenticated using ((select auth.uid()) = user_id);
create policy "documents_insert_own" on public.documents for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "documents_update_own" on public.documents for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "documents_delete_own" on public.documents for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.documents from anon;
