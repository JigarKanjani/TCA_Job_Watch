-- Least-privilege RPCs for the worker and Telegram webhook, each gated by a
-- shared secret in a private schema (no service-role key needed anywhere).
-- Secrets are NOT stored here; insert them once with:
--   insert into private.app_config (key, value) values
--     ('worker_secret', '<64 hex chars>'), ('telegram_webhook_secret', '<64 hex chars>');

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.app_config (key text primary key, value text not null);
revoke all on private.app_config from public, anon, authenticated;

create or replace function private.secret_ok(p_key text, p_value text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_value is not null and length(p_value) >= 32
     and exists (select 1 from private.app_config c where c.key = p_key and c.value = p_value);
$$;
revoke execute on function private.secret_ok(text, text) from public, anon, authenticated;

create or replace function public.link_telegram(p_secret text, p_token text, p_chat_id text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if not private.secret_ok('telegram_webhook_secret', p_secret) then raise exception 'unauthorized'; end if;
  update public.profiles set telegram_chat_id = p_chat_id where telegram_link_token = p_token
  returning coalesce(full_name, email, 'there') into v_name;
  return v_name;
end;
$$;

create or replace function public.unlink_telegram(p_secret text, p_chat_id text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if not private.secret_ok('telegram_webhook_secret', p_secret) then raise exception 'unauthorized'; end if;
  update public.profiles set telegram_chat_id = null where telegram_chat_id = p_chat_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.worker_due_alerts(p_secret text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not private.secret_ok('worker_secret', p_secret) then raise exception 'unauthorized'; end if;
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_result
  from (
    select a.id, a.role, a.city, a.country, a.work_mode, a.min_salary, a.max_experience,
           a.exclude_keywords, a.frequency, a.channels, a.last_sent_at, a.created_at,
           p.email, p.full_name, p.telegram_chat_id, p.discord_webhook_url,
           coalesce((select array_agg(s.job_url) from public.sent_jobs s
                     where s.alert_id = a.id and s.sent_at > now() - interval '60 days'), '{}') as seen_urls
    from public.alerts a join public.profiles p on p.id = a.user_id
    where a.active and (
      a.frequency = 'instant'
      or (a.frequency = 'daily'  and (a.last_sent_at is null or a.last_sent_at < now() - interval '23 hours'))
      or (a.frequency = 'weekly' and (a.last_sent_at is null or a.last_sent_at < now() - interval '167 hours'))
    )
  ) x;
  return v_result;
end;
$$;

create or replace function public.worker_record(p_secret text, p_alert_id uuid, p_jobs jsonb, p_mark_sent boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.secret_ok('worker_secret', p_secret) then raise exception 'unauthorized'; end if;
  insert into public.sent_jobs (alert_id, job_url, title, company, location, site)
  select p_alert_id, left(j ->> 'job_url', 2000), left(j ->> 'title', 300), left(j ->> 'company', 300),
         left(j ->> 'location', 300), left(j ->> 'site', 50)
  from jsonb_array_elements(coalesce(p_jobs, '[]'::jsonb)) as j
  where coalesce(j ->> 'job_url', '') <> ''
  on conflict (alert_id, job_url) do nothing;
  update public.alerts
     set last_checked_at = now(),
         last_sent_at = case when p_mark_sent then now() else last_sent_at end
   where id = p_alert_id;
end;
$$;

revoke execute on function public.link_telegram(text, text, text) from public, authenticated;
revoke execute on function public.unlink_telegram(text, text) from public, authenticated;
revoke execute on function public.worker_due_alerts(text) from public, authenticated;
revoke execute on function public.worker_record(text, uuid, jsonb, boolean) from public, authenticated;
grant execute on function public.link_telegram(text, text, text) to anon;
grant execute on function public.unlink_telegram(text, text) to anon;
grant execute on function public.worker_due_alerts(text) to anon;
grant execute on function public.worker_record(text, uuid, jsonb, boolean) to anon;
