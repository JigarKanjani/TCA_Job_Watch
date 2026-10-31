-- The worker now searches two sources (JobSpy and freehire.me), which can list
-- the same opening under different links. Alongside the links a user already
-- has, return the title and employer of their recent matches so the worker
-- can skip a job they've already been sent from the other source.
-- Additive: one more key in each row; older workers ignore it.

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
                     where m.user_id = a.user_id and m.found_at > now() - interval '90 days'), '{}') as seen_urls,
           coalesce((select jsonb_agg(jsonb_build_array(m.title, m.company)) from public.job_matches m
                     where m.user_id = a.user_id and m.found_at > now() - interval '60 days'
                       and m.title is not null and m.company is not null), '[]'::jsonb) as seen_jobs
    from public.alerts a join public.profiles p on p.id = a.user_id
    where a.active and (a.last_checked_at is null
      or a.last_checked_at < now() - case when a.frequency = 'instant' then interval '25 minutes' else interval '5 hours' end)
  ) x;
  return v_result;
end;
$$;
