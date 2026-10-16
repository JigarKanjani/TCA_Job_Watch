-- Shared read-only demo account: reads everything, writes nothing (restrictive RLS).
-- Set the demo user id once (not committed):
--   insert into private.app_config (key, value) select 'demo_user_id', id::text from auth.users where email = 'demo@example.com';
create or replace function private.is_demo()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.app_config where key = 'demo_user_id' and value = (select auth.uid())::text);
$$;
revoke execute on function private.is_demo() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_demo() to authenticated;

create policy "demo_read_only_insert" on public.alerts as restrictive for insert to authenticated with check (not private.is_demo());
create policy "demo_read_only_update" on public.alerts as restrictive for update to authenticated using (not private.is_demo());
create policy "demo_read_only_delete" on public.alerts as restrictive for delete to authenticated using (not private.is_demo());
create policy "demo_read_only_insert" on public.job_matches as restrictive for insert to authenticated with check (not private.is_demo());
create policy "demo_read_only_update" on public.job_matches as restrictive for update to authenticated using (not private.is_demo());
create policy "demo_read_only_delete" on public.job_matches as restrictive for delete to authenticated using (not private.is_demo());
create policy "demo_read_only_insert" on public.documents as restrictive for insert to authenticated with check (not private.is_demo());
create policy "demo_read_only_update" on public.documents as restrictive for update to authenticated using (not private.is_demo());
create policy "demo_read_only_delete" on public.documents as restrictive for delete to authenticated using (not private.is_demo());
create policy "demo_read_only_update" on public.profiles as restrictive for update to authenticated using (not private.is_demo());
create policy "demo_read_only_insert" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'documents' or not private.is_demo());
create policy "demo_read_only_delete" on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'documents' or not private.is_demo());

create or replace function public.disconnect_telegram()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  if private.is_demo() then raise exception 'The demo account is read-only.'; end if;
  update public.profiles
     set telegram_chat_id = null, telegram_link_token = replace(gen_random_uuid()::text, '-', '')
   where id = (select auth.uid());
end;
$$;
