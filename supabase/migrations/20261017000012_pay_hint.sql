-- The sentence of a job description that states pay ("The range is $78,000 to
-- $92,000 per year"), so lists and alerts can show posted pay without loading
-- whole descriptions. Exposed to the API as a computed column: select pay_hint.
create or replace function public.pay_hint(m public.job_matches)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    substring(m.description from '(.{0,90}(?:CA\$|C\$|US\$|\$)\s?\d[\d,.]*\s?[kK]?\s*(?:/\s*(?:yr|year|hr|hour))?\s*(?:-|–|—|to)\s*(?:CA\$|C\$|US\$|\$)\s?\d[\d,.]*\s?[kK]?.{0,40})'),
    substring(m.description from '(.{0,60}(?:CA\$|C\$|US\$|\$)\s?\d[\d,.]*\s?[kK]?\s*(?:/\s*(?:hr|hour|yr|year)|per (?:hour|year|annum)|an hour|a year|hourly|annually).{0,12})')
  );
$$;
revoke execute on function public.pay_hint(public.job_matches) from anon;
grant execute on function public.pay_hint(public.job_matches) to authenticated;

-- Alerts carry the pay sentence too, so the worker can show posted pay.
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
              from (select jm.id, jm.title, jm.company, jm.location, jm.job_url, jm.site, jm.salary, jm.is_remote,
                           jm.date_posted, jm.found_at, public.pay_hint(jm) as pay_hint
                      from public.job_matches jm
                     where jm.alert_id = a.id and jm.notified_at is null and jm.status = 'new'
                     order by jm.found_at desc limit 50) m) as matches
    from public.alerts a join public.profiles p on p.id = a.user_id
    where a.active and exists (select 1 from public.job_matches m
                                where m.alert_id = a.id and m.notified_at is null and m.status = 'new')
  ) x;
  return v_result;
end;
$$;

notify pgrst, 'reload schema';
