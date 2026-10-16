-- JobWatch schema: profiles, alerts, sent_jobs (applied to project wtzsmaejnobavhvwwttd)

create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text,
  full_name           text,
  telegram_chat_id    text,
  telegram_link_token text not null default replace(gen_random_uuid()::text, '-', ''),
  discord_webhook_url text,
  created_at          timestamptz not null default now(),
  constraint profiles_discord_webhook_format check (
    discord_webhook_url is null
    or discord_webhook_url ~ '^https://(discord|discordapp)\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+$'
  )
);
create unique index profiles_telegram_link_token_key on public.profiles (telegram_link_token);
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
-- email comes from Google; telegram_chat_id is written only by the webhook.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, discord_webhook_url) on public.profiles to authenticated;

create table public.alerts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  role             text not null check (char_length(btrim(role)) between 2 and 100),
  city             text not null default '' check (char_length(city) <= 100),
  country          text not null default 'Canada' check (country in ('Canada', 'USA')),
  work_mode        text not null default 'any' check (work_mode in ('any', 'remote', 'onsite')),
  min_salary       integer check (min_salary is null or min_salary between 0 and 1000000),
  max_experience   integer check (max_experience is null or max_experience between 0 and 50),
  exclude_keywords text[] not null default '{}',
  frequency        text not null default 'instant' check (frequency in ('instant', 'daily', 'weekly')),
  channels         text[] not null default '{email}' check (
                     cardinality(channels) >= 1
                     and channels <@ array['email', 'telegram', 'discord']::text[]
                   ),
  active           boolean not null default true,
  last_checked_at  timestamptz,
  last_sent_at     timestamptz,
  created_at       timestamptz not null default now()
);
create index alerts_user_id_idx on public.alerts (user_id);
create index alerts_active_idx on public.alerts (active) where active;
alter table public.alerts enable row level security;
create policy "alerts_select_own" on public.alerts for select to authenticated using ((select auth.uid()) = user_id);
create policy "alerts_insert_own" on public.alerts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "alerts_update_own" on public.alerts for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "alerts_delete_own" on public.alerts for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.alerts from anon;

create table public.sent_jobs (
  alert_id   uuid not null references public.alerts(id) on delete cascade,
  job_url    text not null,
  title      text,
  company    text,
  location   text,
  site       text,
  sent_at    timestamptz not null default now(),
  primary key (alert_id, job_url)
);
create index sent_jobs_sent_at_idx on public.sent_jobs (sent_at desc);
alter table public.sent_jobs enable row level security;
create policy "sent_jobs_select_own" on public.sent_jobs for select to authenticated using (
  exists (select 1 from public.alerts a where a.id = sent_jobs.alert_id and a.user_id = (select auth.uid()))
);
revoke insert, update, delete on public.sent_jobs from anon, authenticated;
revoke all on public.sent_jobs from anon;

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create function public.enforce_alert_limit() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.alerts where user_id = new.user_id) >= 10 then
    raise exception 'You can watch up to 10 roles at a time. Delete one to add another.';
  end if;
  return new;
end;
$$;
create trigger alerts_enforce_limit before insert on public.alerts for each row execute function public.enforce_alert_limit();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.enforce_alert_limit() from public, anon, authenticated;
