-- Retire v1 worker functions (they target the deprecated sent_jobs table).
revoke execute on function public.worker_due_alerts(text) from anon, authenticated, public;
revoke execute on function public.worker_record(text, uuid, jsonb, boolean) from anon, authenticated, public;

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
      or a.last_checked_at < now() - case when a.frequency = 'instant' then interval '100 minutes' else interval '5 hours' end)
  ) x;
  return v_result;
end;
$$;

create or replace function public.worker_save_matches(p_secret text, p_alert_id uuid, p_jobs jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer := 0;
begin
  if not private.secret_ok('worker_secret', p_secret) then raise exception 'unauthorized'; end if;
  insert into public.job_matches (user_id, alert_id, job_url, title, company, location, site,
                                  is_remote, salary, date_posted, description, source)
  select a.user_id, a.id, left(j ->> 'job_url', 2000), left(j ->> 'title', 300), left(j ->> 'company', 300),
         left(j ->> 'location', 300), left(j ->> 'site', 50),
         case when j ->> 'is_remote' in ('true','false') then (j ->> 'is_remote')::boolean end,
         left(j ->> 'salary', 120),
         case when (j ->> 'date_posted') ~ '^\d{4}-\d{2}-\d{2}' then left(j ->> 'date_posted', 10)::date end,
         left(j ->> 'description', 60000), 'alert'
  from public.alerts a cross join lateral jsonb_array_elements(coalesce(p_jobs, '[]'::jsonb)) as j
  where a.id = p_alert_id and char_length(coalesce(j ->> 'job_url', '')) >= 8
  on conflict (user_id, job_url) do nothing;
  get diagnostics v_count = row_count;
  update public.alerts set last_checked_at = now() where id = p_alert_id;
  return v_count;
end;
$$;

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
                     where alert_id = a.id and notified_at is null and status <> 'not_interested'
                     order by found_at desc limit 25) m) as matches
    from public.alerts a join public.profiles p on p.id = a.user_id
    where a.active and exists (select 1 from public.job_matches m
                                where m.alert_id = a.id and m.notified_at is null and m.status <> 'not_interested')
  ) x;
  return v_result;
end;
$$;

create or replace function public.worker_mark_notified(p_secret text, p_alert_id uuid, p_match_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.secret_ok('worker_secret', p_secret) then raise exception 'unauthorized'; end if;
  update public.job_matches set notified_at = now()
   where alert_id = p_alert_id and id = any(p_match_ids) and notified_at is null;
  update public.alerts set last_sent_at = now() where id = p_alert_id;
end;
$$;

revoke execute on function public.worker_alerts_to_scrape(text) from public, authenticated;
revoke execute on function public.worker_save_matches(text, uuid, jsonb) from public, authenticated;
revoke execute on function public.worker_pending_deliveries(text) from public, authenticated;
revoke execute on function public.worker_mark_notified(text, uuid, uuid[]) from public, authenticated;
grant execute on function public.worker_alerts_to_scrape(text) to anon;
grant execute on function public.worker_save_matches(text, uuid, jsonb) to anon;
grant execute on function public.worker_pending_deliveries(text) to anon;
grant execute on function public.worker_mark_notified(text, uuid, uuid[]) to anon;
