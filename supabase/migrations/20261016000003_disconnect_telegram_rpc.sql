create or replace function public.disconnect_telegram()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  update public.profiles
     set telegram_chat_id = null, telegram_link_token = replace(gen_random_uuid()::text, '-', '')
   where id = (select auth.uid());
end;
$$;
revoke execute on function public.disconnect_telegram() from public, anon;
grant execute on function public.disconnect_telegram() to authenticated;
