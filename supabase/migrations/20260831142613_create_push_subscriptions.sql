create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  region_lat double precision,
  region_lng double precision,
  alert_threshold text not null default 'WARNING'
    check (alert_threshold in ('WATCH', 'WARNING', 'CRITICAL')),
  last_notified_level text,
  last_notified_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_region_pair check (
    (region_lat is null and region_lng is null)
    or (region_lat is not null and region_lng is not null)
  ),
  constraint push_subscriptions_region_latitude check (
    region_lat is null or region_lat between -90 and 90
  ),
  constraint push_subscriptions_region_longitude check (
    region_lng is null or region_lng between -180 and 180
  )
);

comment on table public.push_subscriptions is
  'Web Push 구독 정보. failure_count가 5를 초과한 행은 위험 감시 대상에서 제외한다.';

alter table public.push_subscriptions enable row level security;

create or replace function public.round_push_subscription_region()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.region_lat is not null then
    new.region_lat = round(new.region_lat::numeric, 3)::double precision;
    new.region_lng = round(new.region_lng::numeric, 3)::double precision;
  end if;

  return new;
end;
$$;

revoke all on function public.round_push_subscription_region() from public, anon, authenticated;

create trigger push_subscriptions_round_region
before insert or update of region_lat, region_lng on public.push_subscriptions
for each row execute function public.round_push_subscription_region();

create trigger push_subscriptions_touch_updated_at
before update on public.push_subscriptions
for each row execute function public.touch_updated_at();

create index push_subscriptions_user_id_idx
on public.push_subscriptions (user_id);

create index push_subscriptions_region_idx
on public.push_subscriptions (region_lat, region_lng)
where region_lat is not null;

revoke all on table public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;
grant all on table public.push_subscriptions to service_role;

create policy "push_subscriptions_select_own"
on public.push_subscriptions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "push_subscriptions_insert_own"
on public.push_subscriptions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "push_subscriptions_update_own"
on public.push_subscriptions
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "push_subscriptions_delete_own"
on public.push_subscriptions
for delete
to authenticated
using ((select auth.uid()) = user_id);
