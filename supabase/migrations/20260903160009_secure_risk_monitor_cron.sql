create or replace function public.invoke_risk_monitor()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  cron_secret text;
begin
  select decrypted_secret
  into cron_secret
  from vault.decrypted_secrets
  where name = 'risk_monitor_cron_secret'
  order by created_at desc
  limit 1;

  if cron_secret is null or cron_secret = '' then
    raise warning 'risk-monitor skipped: Vault secret risk_monitor_cron_secret is not configured';
    return null;
  end if;

  return net.http_post(
    url := 'https://qlaeegqbopzwqdcbjbxc.supabase.co/functions/v1/risk-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

comment on function public.invoke_risk_monitor() is
  'Calls risk-monitor with a dedicated internal secret stored in Supabase Vault.';

revoke all on function public.invoke_risk_monitor() from public, anon, authenticated;
