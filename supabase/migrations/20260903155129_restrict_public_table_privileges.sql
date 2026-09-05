-- Supabase projects can grant broad table privileges to API roles by default.
-- Reset those defaults, then restore only the privileges required by our RLS policies.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

revoke all privileges on all tables in schema public from anon, authenticated;

grant select, update on table public.profiles to authenticated;

grant select on table public.shelter_operations to anon;
grant select, insert, update, delete on table public.shelter_operations to authenticated;

grant select, insert, update on table public.notification_preferences to authenticated;

grant select on table public.sensor_feeds to anon;
grant select, insert, update, delete on table public.sensor_feeds to authenticated;

grant select, insert on table public.audit_logs to authenticated;
grant select, insert on table public.api_health_metrics to authenticated;

grant select on table public.cctv_cameras to anon, authenticated;

grant select, insert, update, delete on table public.push_subscriptions to authenticated;

-- This migration may be applied remotely before concurrent underpass work is deployed.
-- Preserve its intended read-only API access when the table already exists.
do $$
begin
  if to_regclass('public.underpasses') is not null then
    execute 'grant select on table public.underpasses to anon, authenticated';
  end if;
end
$$;

alter function public.touch_updated_at() set search_path = pg_catalog, public;
