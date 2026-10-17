-- Search briefs: after "Find jobs now", a short email of what was found. Sent
-- at once inside the user's delivery hours, otherwise held until their next
-- window opens (computed by the app in the user's timezone).

alter table public.profiles add column if not exists search_briefs boolean not null default true;
grant update (search_briefs) on public.profiles to authenticated;

create table if not exists public.scheduled_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null default 'search_brief' check (kind in ('search_brief')),
  send_at    timestamptz not null,
  status     text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  match_ids  uuid[] not null default '{}' check (cardinality(match_ids) <= 100),
  attempts   integer not null default 0,
  last_error text check (char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index if not exists scheduled_messages_due_idx on public.scheduled_messages (send_at) where status = 'pending';
create index if not exists scheduled_messages_user_idx on public.scheduled_messages (user_id, status);
alter table public.scheduled_messages enable row level security;
create policy "scheduled_messages_select_own" on public.scheduled_messages for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.scheduled_messages from anon, authenticated;
grant select on public.scheduled_messages to authenticated;

-- Record a brief the app just sent, or hold one for later. One pending brief
-- per user: searches made while it waits join it.
create or replace function public.queue_search_brief(p_match_ids uuid[], p_send_at timestamptz, p_sent boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_ids  uuid[];
  v_id   uuid;
  v_at   timestamptz := least(greatest(coalesce(p_send_at, now()), now()), now() + interval '8 days');
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if private.is_demo() then raise exception 'The demo account is read-only.'; end if;
  select coalesce(array_agg(id), '{}') into v_ids
    from (select id from public.job_matches where user_id = v_user and id = any(p_match_ids) limit 100) m;
  if cardinality(v_ids) = 0 then return null; end if;

  if p_sent then
    insert into public.scheduled_messages (user_id, send_at, status, match_ids, attempts, sent_at)
    values (v_user, now(), 'sent', v_ids, 1, now()) returning id into v_id;
    return v_id;
  end if;

  select id into v_id from public.scheduled_messages
   where user_id = v_user and kind = 'search_brief' and status = 'pending'
   order by send_at limit 1 for update;
  if v_id is null then
    insert into public.scheduled_messages (user_id, send_at, match_ids) values (v_user, v_at, v_ids) returning id into v_id;
  else
    update public.scheduled_messages
       set match_ids = (select coalesce(array_agg(x), '{}') from (select distinct unnest(match_ids || v_ids) as x limit 100) u),
           send_at   = least(send_at, v_at)
     where id = v_id;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.queue_search_brief(uuid[], timestamptz, boolean) from public, anon;
grant execute on function public.queue_search_brief(uuid[], timestamptz, boolean) to authenticated;

-- Briefs that are due, with everything needed to write them.
create or replace function public.worker_due_briefs(p_secret text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not private.secret_ok('worker_secret', p_secret) then raise exception 'unauthorized'; end if;
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_result
  from (
    select s.id, s.created_at, s.attempts, p.email, p.full_name, p.search_briefs,
           (select coalesce(jsonb_agg(to_jsonb(j)), '[]'::jsonb)
              from (select m.id, m.title, m.company, m.location, m.job_url, m.salary, m.status,
                           public.pay_hint(m) as pay_hint, a.role as alert_role, a.country, a.windows, a.timezone
                      from public.job_matches m left join public.alerts a on a.id = m.alert_id
                     where m.id = any(s.match_ids)) j) as jobs
      from public.scheduled_messages s join public.profiles p on p.id = s.user_id
     where s.status = 'pending' and s.send_at <= now()
     order by s.send_at
     limit 50
  ) x;
  return v_result;
end;
$$;

-- p_status: 'sent', 'cancelled' (nothing left to send / opted out) or 'retry'.
create or replace function public.worker_finish_brief(p_secret text, p_id uuid, p_status text, p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.secret_ok('worker_secret', p_secret) then raise exception 'unauthorized'; end if;
  update public.scheduled_messages
     set attempts   = attempts + 1,
         status     = case when p_status in ('sent', 'cancelled') then p_status
                           when attempts + 1 >= 3 then 'failed' else 'pending' end,
         sent_at    = case when p_status = 'sent' then now() end,
         send_at    = case when p_status = 'retry' then now() + interval '30 minutes' else send_at end,
         last_error = left(p_error, 300)
   where id = p_id and status = 'pending';
end;
$$;

revoke execute on function public.worker_due_briefs(text) from public, authenticated;
revoke execute on function public.worker_finish_brief(text, uuid, text, text) from public, authenticated;
grant execute on function public.worker_due_briefs(text) to anon;
grant execute on function public.worker_finish_brief(text, uuid, text, text) to anon;

notify pgrst, 'reload schema';
