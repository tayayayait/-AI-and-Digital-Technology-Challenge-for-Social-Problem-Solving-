begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

select results_eq(
  $$ select count(*)::integer from pg_extension where extname in ('pg_cron', 'pg_net') $$,
  array[2],
  'pg_cron과 pg_net 확장이 활성화된다'
);

select has_function(
  'public',
  'invoke_risk_monitor',
  array[]::text[],
  'Vault 기반 risk-monitor 호출 함수가 존재한다'
);

select results_eq(
  $$ select schedule from cron.job where jobname = 'risk-monitor-5min' $$,
  array['*/5 * * * *'::text],
  'risk-monitor가 5분마다 실행된다'
);

select results_eq(
  $$ select command from cron.job where jobname = 'risk-monitor-5min' $$,
  array['select public.invoke_risk_monitor();'::text],
  'cron은 키를 포함하지 않고 보호된 호출 함수만 실행한다'
);

select * from finish();
rollback;
