create type public.audit_action_type as enum (
  'OPS_ACTION',
  'NOTICE_GENERATION',
  'SHELTER_STATUS_UPDATE'
);

create type public.api_health_status as enum ('OK', 'STALE', 'FAILED', 'FALLBACK');

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action public.audit_action_type not null,
  entity_type text not null,
  entity_id text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

grant select, insert on table public.audit_logs to authenticated;
grant all on table public.audit_logs to service_role;

create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_action_idx on public.audit_logs (action, created_at desc);

create policy "audit_logs_operator_select"
on public.audit_logs
for select
to authenticated
using (public.has_operator_access());

create policy "audit_logs_operator_insert"
on public.audit_logs
for insert
to authenticated
with check (
  public.has_operator_access()
  and (actor_id is null or actor_id = auth.uid())
);

create table public.api_health_metrics (
  id uuid primary key default gen_random_uuid(),
  api_name text not null,
  status public.api_health_status not null,
  response_time_ms integer check (response_time_ms is null or response_time_ms >= 0),
  fallback_used boolean not null default false,
  last_success_at timestamptz,
  error_code text,
  user_message text not null,
  operator_message text,
  created_at timestamptz not null default now()
);

alter table public.api_health_metrics enable row level security;

grant select, insert on table public.api_health_metrics to authenticated;
grant all on table public.api_health_metrics to service_role;

create index api_health_metrics_api_idx on public.api_health_metrics (api_name, created_at desc);
create index api_health_metrics_status_idx on public.api_health_metrics (status, created_at desc);

create policy "api_health_metrics_operator_select"
on public.api_health_metrics
for select
to authenticated
using (public.has_operator_access());

create policy "api_health_metrics_operator_insert"
on public.api_health_metrics
for insert
to authenticated
with check (public.has_operator_access());
