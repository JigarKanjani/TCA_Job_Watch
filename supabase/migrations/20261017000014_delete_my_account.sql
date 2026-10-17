-- Self-serve account deletion. Removing the auth user cascades to the
-- profile and everything hanging off it (alerts, job log, documents rows,
-- scheduled briefs). The app deletes the user's stored files first.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if private.is_demo() then raise exception 'The demo account is read-only.'; end if;
  delete from auth.users where id = v_user;
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
