-- Rate limiting shared by every Vercel function and the worker. One row per
-- (bucket, key): a fixed window that resets itself, so the table only grows
-- with distinct users/IPs. Only the app's servers can call it (worker secret).
create table if not exists private.rate_limits (
  bucket       text not null,
  key          text not null,
  window_start timestamptz not null default now(),
  hits         integer not null default 0,
  primary key (bucket, key)
);

create or replace function public.rate_limit_hit(p_secret text, p_bucket text, p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
  v_window interval := make_interval(secs => greatest(1, least(p_window_seconds, 2592000)));
begin
  if not private.secret_ok('worker_secret', p_secret) then raise exception 'unauthorized'; end if;
  insert into private.rate_limits as r (bucket, key, window_start, hits)
  values (left(p_bucket, 40), left(p_key, 128), now(), 1)
  on conflict (bucket, key) do update
    set hits         = case when r.window_start < now() - v_window then 1 else r.hits + 1 end,
        window_start = case when r.window_start < now() - v_window then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= greatest(p_limit, 0);
end;
$$;
revoke execute on function public.rate_limit_hit(text, text, text, integer, integer) from public;
grant execute on function public.rate_limit_hit(text, text, text, integer, integer) to anon, authenticated;

-- Backstops for writes made straight to the API (not through the app):
-- at most 600 jobs added per signed-in user per hour (the scheduled worker
-- runs without a user and is not counted), and 50 documents per user.
create or replace function private.guard_job_inserts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if (select count(*) from public.job_matches
       where user_id = new.user_id and found_at > now() - interval '1 hour') >= 600 then
    raise exception 'Too many jobs added in the last hour. Please slow down.' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  return new;
end;
$$;
create or replace trigger job_matches_guard_inserts before insert on public.job_matches
  for each row execute function private.guard_job_inserts();

create or replace function private.guard_document_inserts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.documents where user_id = new.user_id) >= 50 then
    raise exception 'Document limit reached. Remove one to add another.' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  if (select count(*) from public.documents where user_id = new.user_id and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many uploads in the last hour. Please slow down.' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  return new;
end;
$$;
create or replace trigger documents_guard_inserts before insert on public.documents
  for each row execute function private.guard_document_inserts();
