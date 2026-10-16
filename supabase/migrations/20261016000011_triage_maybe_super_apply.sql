-- Triage: a "Maybe" pile next to "To apply" (saved) and "Not interested",
-- plus Super Apply — a 24-hour apply-by deadline that pins a job to the top
-- of the dashboard.
alter table public.job_matches drop constraint if exists job_matches_status_check;
alter table public.job_matches add constraint job_matches_status_check check (
  status in ('new','saved','maybe','applied','interviewing','offer','rejected','withdrawn','not_interested'));

alter table public.job_matches add column if not exists apply_by timestamptz;
grant update (apply_by) on public.job_matches to authenticated;

create index if not exists job_matches_user_status_idx on public.job_matches (user_id, status);

-- A brand-new alert's first batch is queued for delivery (instant alerts are
-- sent straight away by the app; daily/weekly ones wait for the digest).
-- "Find jobs now" keeps marking its finds as seen, since the user is looking
-- at them in the app.
drop function if exists public.save_found_jobs(uuid, jsonb);
create or replace function public.save_found_jobs(p_alert_id uuid, p_jobs jsonb, p_queue boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := (select auth.uid());
  v_count integer := 0;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if private.is_demo() then raise exception 'The demo account is read-only.'; end if;
  if not exists (select 1 from public.alerts where id = p_alert_id and user_id = v_user) then
    raise exception 'alert not found';
  end if;
  -- Backstop rate limit: one on-demand save per alert every 2 minutes.
  if exists (select 1 from public.alerts where id = p_alert_id and last_checked_at > now() - interval '2 minutes') then
    return 0;
  end if;
  if jsonb_typeof(p_jobs) <> 'array' or jsonb_array_length(p_jobs) > 60 then
    raise exception 'invalid jobs payload';
  end if;

  insert into public.job_matches (user_id, alert_id, job_url, title, company, location, site,
                                  is_remote, salary, date_posted, source, notified_at)
  select v_user, p_alert_id,
         left(j ->> 'job_url', 2000), left(j ->> 'title', 300), left(j ->> 'company', 300),
         left(j ->> 'location', 300), left(j ->> 'site', 50),
         case when j ->> 'is_remote' in ('true','false') then (j ->> 'is_remote')::boolean end,
         left(j ->> 'salary', 120),
         case when (j ->> 'date_posted') ~ '^\d{4}-\d{2}-\d{2}' then left(j ->> 'date_posted', 10)::date end,
         'alert', case when p_queue then null else now() end
  from jsonb_array_elements(p_jobs) as j
  where (j ->> 'job_url') ~ '^https://'
    and char_length(j ->> 'job_url') between 8 and 2000
  on conflict (user_id, job_url) do nothing;
  get diagnostics v_count = row_count;

  update public.alerts set last_checked_at = now() where id = p_alert_id;
  return v_count;
end;
$$;
revoke execute on function public.save_found_jobs(uuid, jsonb, boolean) from public, anon;
grant execute on function public.save_found_jobs(uuid, jsonb, boolean) to authenticated;

-- The app sent an instant alert itself: mark those matches delivered.
create or replace function public.mark_alert_delivered(p_alert_id uuid, p_match_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if private.is_demo() then raise exception 'The demo account is read-only.'; end if;
  if not exists (select 1 from public.alerts where id = p_alert_id and user_id = v_user) then
    raise exception 'alert not found';
  end if;
  update public.job_matches set notified_at = now()
   where alert_id = p_alert_id and user_id = v_user and id = any(p_match_ids) and notified_at is null;
  update public.alerts set last_sent_at = now() where id = p_alert_id;
end;
$$;
revoke execute on function public.mark_alert_delivered(uuid, uuid[]) from public, anon;
grant execute on function public.mark_alert_delivered(uuid, uuid[]) to authenticated;

-- Instant alerts are searched on every worker run (every ~30 minutes);
-- digest alerts every 5 hours.
create or replace function public.worker_alerts_to_scrape(p_secret text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not private.secret_ok('worker_secret', p_secret) then raise exception 'unauthorized'; end if;
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_result
  from (
    select a.id, a.user_id, a.role, a.city, a.country, a.work_mode, a.min_salary, a.max_experience,
           a.exclude_keywords, a.frequency, a.last_checked_at, p.plan,
           coalesce((select array_agg(m.job_url) from public.job_matches m
                     where m.user_id = a.user_id and m.found_at > now() - interval '90 days'), '{}') as seen_urls
    from public.alerts a join public.profiles p on p.id = a.user_id
    where a.active and (a.last_checked_at is null
      or a.last_checked_at < now() - case when a.frequency = 'instant' then interval '25 minutes' else interval '5 hours' end)
  ) x;
  return v_result;
end;
$$;

-- Only unsorted jobs are sent (anything already swiped in the app is skipped),
-- and daily/weekly digests carry up to 50 roles in one message.
create or replace function public.worker_pending_deliveries(p_secret text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not private.secret_ok('worker_secret', p_secret) then raise exception 'unauthorized'; end if;
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_result
  from (
    select a.id, a.role, a.city, a.country, a.work_mode, a.frequency, a.channels, a.windows, a.timezone, a.last_sent_at,
           p.email, p.full_name, p.telegram_chat_id, p.discord_webhook_url, p.plan,
           (select jsonb_agg(to_jsonb(m) order by m.found_at desc)
              from (select id, title, company, location, job_url, site, salary, is_remote, date_posted, found_at
                      from public.job_matches
                     where alert_id = a.id and notified_at is null and status = 'new'
                     order by found_at desc limit 50) m) as matches
    from public.alerts a join public.profiles p on p.id = a.user_id
    where a.active and exists (select 1 from public.job_matches m
                                where m.alert_id = a.id and m.notified_at is null and m.status = 'new')
  ) x;
  return v_result;
end;
$$;

notify pgrst, 'reload schema';
