-- Per-plan alert limits in private.app_config (paywall switch without a deploy):
--   update private.app_config set value = '3' where key = 'alert_limit_free';
insert into private.app_config (key, value) values ('alert_limit_free', '10'), ('alert_limit_pro', '10')
on conflict (key) do nothing;

create or replace function public.enforce_alert_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_plan text; v_limit integer;
begin
  select plan into v_plan from public.profiles where id = new.user_id;
  select coalesce(nullif(value, '')::integer, 10) into v_limit
    from private.app_config where key = 'alert_limit_' || coalesce(v_plan, 'free');
  v_limit := least(coalesce(v_limit, 10), 25);
  if (select count(*) from public.alerts where user_id = new.user_id) >= v_limit then
    raise exception 'Your plan allows % alerts. Delete one to add another.', v_limit using errcode = 'P0001', hint = 'plan_limit';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_alert_limit() from public, anon, authenticated;

create or replace function public.my_alert_limit()
returns integer language sql stable security definer set search_path = '' as $$
  select least(coalesce(nullif(c.value, '')::integer, 10), 25)
    from public.profiles p left join private.app_config c on c.key = 'alert_limit_' || p.plan
   where p.id = (select auth.uid());
$$;
revoke execute on function public.my_alert_limit() from public, anon;
grant execute on function public.my_alert_limit() to authenticated;
