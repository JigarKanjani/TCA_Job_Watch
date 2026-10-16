create table public.job_matches (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  alert_id      uuid references public.alerts(id) on delete set null,
  job_url       text not null check (char_length(job_url) between 8 and 2000),
  title         text check (char_length(title) <= 300),
  company       text check (char_length(company) <= 300),
  location      text check (char_length(location) <= 300),
  site          text check (char_length(site) <= 50),
  is_remote     boolean,
  salary        text check (char_length(salary) <= 120),
  date_posted   date,
  description   text check (char_length(description) <= 60000),
  source        text not null default 'manual' check (source in ('alert', 'manual')),
  found_at      timestamptz not null default now(),
  notified_at   timestamptz,
  status        text not null default 'new' check (
                  status in ('new','saved','applied','interviewing','offer','rejected','withdrawn','not_interested')),
  applied_at    date,
  resume_doc_id uuid references public.documents(id) on delete set null,
  cover_doc_id  uuid references public.documents(id) on delete set null,
  notes         text check (char_length(notes) <= 10000),
  updated_at    timestamptz not null default now(),
  unique (user_id, job_url)
);
create index job_matches_user_found_idx on public.job_matches (user_id, found_at desc);
create index job_matches_alert_idx on public.job_matches (alert_id);
create index job_matches_pending_idx on public.job_matches (alert_id) where notified_at is null;
create index job_matches_resume_idx on public.job_matches (resume_doc_id);
create index job_matches_cover_idx on public.job_matches (cover_doc_id);
alter table public.job_matches enable row level security;
create policy "job_matches_select_own" on public.job_matches for select to authenticated using ((select auth.uid()) = user_id);
create policy "job_matches_insert_own" on public.job_matches for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "job_matches_update_own" on public.job_matches for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "job_matches_delete_own" on public.job_matches for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.job_matches from anon;
revoke insert, update on public.job_matches from authenticated;
grant insert (job_url, title, company, location, site, is_remote, salary, date_posted, description,
              status, applied_at, resume_doc_id, cover_doc_id, notes) on public.job_matches to authenticated;
grant update (title, company, location, salary, description, status, applied_at,
              resume_doc_id, cover_doc_id, notes) on public.job_matches to authenticated;
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger job_matches_touch before update on public.job_matches for each row execute function public.touch_updated_at();
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke all on public.sent_jobs from anon, authenticated;
comment on table public.sent_jobs is 'Deprecated (v1). Superseded by job_matches. Safe to drop.';
