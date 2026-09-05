create type public.sensor_feed_status as enum ('DISABLED', 'PENDING_ACCESS', 'ACTIVE', 'FAILED');

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_consent boolean not null default false,
  browser_permission text not null default 'default' check (browser_permission in ('default', 'granted', 'denied', 'unsupported')),
  alert_threshold text not null default 'WARNING' check (alert_threshold in ('WATCH', 'WARNING', 'CRITICAL')),
  background_location_enabled boolean not null default false,
  consented_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_preferences_background_location_off check (background_location_enabled = false),
  constraint notification_preferences_consent_timestamp check (
    (push_consent = false)
    or (push_consent = true and consented_at is not null)
  )
);

alter table public.notification_preferences enable row level security;

grant select, insert, update on table public.notification_preferences to authenticated;
grant all on table public.notification_preferences to service_role;

create trigger notification_preferences_touch_updated_at
before update on public.notification_preferences
for each row execute function public.touch_updated_at();

create policy "notification_preferences_select_own"
on public.notification_preferences
for select
to authenticated
using (auth.uid() = user_id or public.has_operator_access());

create policy "notification_preferences_insert_own"
on public.notification_preferences
for insert
to authenticated
with check (auth.uid() = user_id and background_location_enabled = false);

create policy "notification_preferences_update_own"
on public.notification_preferences
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id and background_location_enabled = false);

create table public.sensor_feeds (
  id text primary key,
  name text not null,
  provider text not null,
  region text not null default '서울 강남구',
  status public.sensor_feed_status not null default 'PENDING_ACCESS',
  source text not null default '확실한 정보 없음',
  last_observed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sensor_feeds enable row level security;

grant select on table public.sensor_feeds to anon;
grant select, insert, update, delete on table public.sensor_feeds to authenticated;
grant all on table public.sensor_feeds to service_role;

create trigger sensor_feeds_touch_updated_at
before update on public.sensor_feeds
for each row execute function public.touch_updated_at();

create policy "sensor_feeds_select_public"
on public.sensor_feeds
for select
to anon, authenticated
using (true);

create policy "sensor_feeds_operator_insert"
on public.sensor_feeds
for insert
to authenticated
with check (public.has_operator_access());

create policy "sensor_feeds_operator_update"
on public.sensor_feeds
for update
to authenticated
using (public.has_operator_access())
with check (public.has_operator_access());

create policy "sensor_feeds_admin_delete"
on public.sensor_feeds
for delete
to authenticated
using (public.current_user_role() = 'admin');

insert into public.sensor_feeds (id, name, provider, region, status, source, metadata)
values
  (
    'gangnam-water-level-access',
    '강남권 침수 수위 센서',
    '확실한 정보 없음',
    '서울 강남구',
    'PENDING_ACCESS',
    '실제 센서 데이터 접근권한 확보 전',
    '{"reason":"P3 MVP에서는 실시간 센서 연동을 활성화하지 않는다."}'::jsonb
  ),
  (
    'gangnam-road-control-access',
    '강남권 도로 통제 센서',
    '확실한 정보 없음',
    '서울 강남구',
    'DISABLED',
    '실제 센서 데이터 접근권한 확보 전',
    '{"reason":"운영자 검증 전 자동 통제 알림을 발송하지 않는다."}'::jsonb
  );
