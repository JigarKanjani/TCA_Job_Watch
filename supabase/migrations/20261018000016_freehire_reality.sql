-- Jobs from freehire.me (open-source, employer-direct postings) alongside
-- LinkedIn/Indeed, plus the signals that come with them: is the posting
-- fresh, stale or evergreen; what it requires; the minimum years asked for.
-- Additive only: new nullable columns, and the three job-saving functions
-- accept the extra fields (callers that don't send them are unaffected).

alter table public.job_matches
  add column if not exists reality jsonb check (reality is null or (jsonb_typeof(reality) = 'object' and pg_column_size(reality) <= 1000)),
  add column if not exists requirements jsonb check (requirements is null or (jsonb_typeof(requirements) = 'array' and pg_column_size(requirements) <= 12000)),
  add column if not exists experience_min smallint check (experience_min is null or experience_min between 0 and 50),
  add column if not exists feed text check (feed is null or feed in ('linkedin', 'jobspy', 'freehire'));

grant select (reality, requirements, experience_min, feed) on public.job_matches to authenticated;

-- Keep only the known freshness fields, typed and bounded.
create or replace function private.clean_reality(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) <> 'object' then null else nullif(jsonb_strip_nulls(jsonb_build_object(
    'class', case when p ->> 'class' in ('fresh', 'stale', 'likely-evergreen') then p ->> 'class' end,
    'age_days', case when (p ->> 'age_days') ~ '^\d{1,4}$' then (p ->> 'age_days')::int end,
    'repost_count', case when (p ->> 'repost_count') ~ '^\d{1,4}$' then (p ->> 'repost_count')::int end,
    'mass_posting_count', case when (p ->> 'mass_posting_count') ~ '^\d{1,5}$' then (p ->> 'mass_posting_count')::int end,
    'fake_freshness', case when p ->> 'fake_freshness' in ('true', 'false') then (p ->> 'fake_freshness')::boolean end
  )), '{}'::jsonb) end;
$$;

-- At most 25 requirements of up to 300 characters, each 'required' or 'preferred'.
create or replace function private.clean_requirements(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) <> 'array' then null else (
    select nullif(coalesce(jsonb_agg(jsonb_build_object(
             'text', left(r ->> 'text', 300),
             'priority', case when r ->> 'priority' = 'preferred' then 'preferred' else 'required' end)), '[]'::jsonb), '[]'::jsonb)
      from (select r from jsonb_array_elements(p) as r
             where jsonb_typeof(r) = 'object' and char_length(coalesce(r ->> 'text', '')) between 2 and 300
             limit 25) x
  ) end;
$$;

create or replace function private.clean_experience(p text)
returns smallint language sql immutable set search_path = '' as $$
  select case when p ~ '^\d{1,2}$' and p::int <= 50 then p::smallint end;
$$;

create or replace function private.clean_feed(p text)
returns text language sql immutable set search_path = '' as $$
  select case when p in ('linkedin', 'jobspy', 'freehire') then p end;
$$;

create or replace function public.save_found_jobs(p_alert_id uuid, p_jobs jsonb)
 returns integer language plpgsql security definer set search_path = '' as $function$
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
                                  is_remote, salary, date_posted, description, source, notified_at,
                                  reality, requirements, experience_min, feed)
  select v_user, p_alert_id,
         left(j ->> 'job_url', 2000), left(j ->> 'title', 300), left(j ->> 'company', 300),
         left(j ->> 'location', 300), left(j ->> 'site', 50),
         case when j ->> 'is_remote' in ('true','false') then (j ->> 'is_remote')::boolean end,
         left(j ->> 'salary', 120),
         case when (j ->> 'date_posted') ~ '^\d{4}-\d{2}-\d{2}' then left(j ->> 'date_posted', 10)::date end,
         left(j ->> 'description', 60000),
         'alert', now(),
         private.clean_reality(j -> 'reality'), private.clean_requirements(j -> 'requirements'),
         private.clean_experience(j ->> 'experience_min'), private.clean_feed(j ->> 'feed')
  from jsonb_array_elements(p_jobs) as j
  where (j ->> 'job_url') ~ '^https://'
    and char_length(j ->> 'job_url') between 8 and 2000
  on conflict (user_id, job_url) do nothing;
  get diagnostics v_count = row_count;

  update public.alerts set last_checked_at = now() where id = p_alert_id;
  return v_count;
end;
$function$;

create or replace function public.queue_found_jobs(p_alert_id uuid, p_jobs jsonb)
 returns integer language plpgsql security definer set search_path = '' as $function$
declare
  v_user  uuid := (select auth.uid());
  v_count integer := 0;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if private.is_demo() then raise exception 'The demo account is read-only.'; end if;
  if not exists (select 1 from public.alerts where id = p_alert_id and user_id = v_user) then
    raise exception 'alert not found';
  end if;
  if exists (select 1 from public.alerts where id = p_alert_id and last_checked_at > now() - interval '2 minutes') then
    return 0;
  end if;
  if jsonb_typeof(p_jobs) <> 'array' or jsonb_array_length(p_jobs) > 60 then
    raise exception 'invalid jobs payload';
  end if;

  insert into public.job_matches (user_id, alert_id, job_url, title, company, location, site,
                                  is_remote, salary, date_posted, description, source,
                                  reality, requirements, experience_min, feed)
  select v_user, p_alert_id,
         left(j ->> 'job_url', 2000), left(j ->> 'title', 300), left(j ->> 'company', 300),
         left(j ->> 'location', 300), left(j ->> 'site', 50),
         case when j ->> 'is_remote' in ('true','false') then (j ->> 'is_remote')::boolean end,
         left(j ->> 'salary', 120),
         case when (j ->> 'date_posted') ~ '^\d{4}-\d{2}-\d{2}' then left(j ->> 'date_posted', 10)::date end,
         left(j ->> 'description', 60000),
         'alert',
         private.clean_reality(j -> 'reality'), private.clean_requirements(j -> 'requirements'),
         private.clean_experience(j ->> 'experience_min'), private.clean_feed(j ->> 'feed')
  from jsonb_array_elements(p_jobs) as j
  where (j ->> 'job_url') ~ '^https://'
    and char_length(j ->> 'job_url') between 8 and 2000
  on conflict (user_id, job_url) do nothing;
  get diagnostics v_count = row_count;

  update public.alerts set last_checked_at = now() where id = p_alert_id;
  return v_count;
end;
$function$;

create or replace function public.worker_save_matches(p_secret text, p_alert_id uuid, p_jobs jsonb)
 returns integer language plpgsql security definer set search_path = '' as $function$
declare v_count integer := 0;
begin
  if not private.secret_ok('worker_secret', p_secret) then raise exception 'unauthorized'; end if;

  insert into public.job_matches (user_id, alert_id, job_url, title, company, location, site,
                                  is_remote, salary, date_posted, description, source,
                                  reality, requirements, experience_min, feed)
  select a.user_id, a.id,
         left(j ->> 'job_url', 2000), left(j ->> 'title', 300), left(j ->> 'company', 300),
         left(j ->> 'location', 300), left(j ->> 'site', 50),
         case when j ->> 'is_remote' in ('true','false') then (j ->> 'is_remote')::boolean end,
         left(j ->> 'salary', 120),
         case when (j ->> 'date_posted') ~ '^\d{4}-\d{2}-\d{2}' then left(j ->> 'date_posted', 10)::date end,
         left(j ->> 'description', 60000), 'alert',
         private.clean_reality(j -> 'reality'), private.clean_requirements(j -> 'requirements'),
         private.clean_experience(j ->> 'experience_min'), private.clean_feed(j ->> 'feed')
  from public.alerts a
  cross join lateral jsonb_array_elements(coalesce(p_jobs, '[]'::jsonb)) as j
  where a.id = p_alert_id and char_length(coalesce(j ->> 'job_url', '')) >= 8
  on conflict (user_id, job_url) do nothing;
  get diagnostics v_count = row_count;

  update public.alerts set last_checked_at = now() where id = p_alert_id;
  return v_count;
end;
$function$;

notify pgrst, 'reload schema';
