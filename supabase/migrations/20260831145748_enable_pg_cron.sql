create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_risk_monitor()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  service_role_key text;
begin
  select decrypted_secret
  into service_role_key
  from vault.decrypted_secrets
  where name = 'risk_monitor_service_role_key'
  order by created_at desc
  limit 1;

  if service_role_key is null or service_role_key = '' then
    raise warning 'risk-monitor skipped: Vault secret risk_monitor_service_role_key is not configured';
    return null;
  end if;

  return net.http_post(
    url := 'https://qlaeegqbopzwqdcbjbxc.supabase.co/functions/v1/risk-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

comment on function public.invoke_risk_monitor() is
  'Calls risk-monitor with the risk_monitor_service_role_key value stored in Supabase Vault.';

revoke all on function public.invoke_risk_monitor() from public, anon, authenticated;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'risk-monitor-5min'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'risk-monitor-5min',
    '*/5 * * * *',
    'select public.invoke_risk_monitor();'
  );
end;
$$;
