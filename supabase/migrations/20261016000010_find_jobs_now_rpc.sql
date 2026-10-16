-- "Find jobs now": the signed-in user saves freshly scraped jobs for one of
-- their own alerts. Rate-limited per alert; marked notified because the user
-- is looking at them in the app right now.
create or replace function public.save_found_jobs(p_alert_id uuid, p_jobs jsonb)
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
         'alert', now()
  from jsonb_array_elements(p_jobs) as j
  where (j ->> 'job_url') ~ '^https://'
    and char_length(j ->> 'job_url') between 8 and 2000
  on conflict (user_id, job_url) do nothing;
  get diagnostics v_count = row_count;

  update public.alerts set last_checked_at = now() where id = p_alert_id;
  return v_count;
end;
$$;
revoke execute on function public.save_found_jobs(uuid, jsonb) from public, anon;
grant execute on function public.save_found_jobs(uuid, jsonb) to authenticated;
