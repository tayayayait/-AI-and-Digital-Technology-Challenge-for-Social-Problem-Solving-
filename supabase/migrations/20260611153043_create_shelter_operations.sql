create type public.shelter_operating_status as enum ('OPERATING', 'CHECK_REQUIRED', 'EXCLUDED');

create table public.shelter_operations (
  id text primary key,
  name text not null,
  address text not null,
  lat double precision not null,
  lng double precision not null,
  capacity integer not null check (capacity >= 0),
  status public.shelter_operating_status not null default 'CHECK_REQUIRED',
  underground boolean not null default false,
  facility_type text not null,
  source text not null default '확실한 정보 없음',
  checked_at timestamptz,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shelter_operations enable row level security;

grant select on table public.shelter_operations to anon;
grant select, insert, update, delete on table public.shelter_operations to authenticated;
grant all on table public.shelter_operations to service_role;

create trigger shelter_operations_touch_updated_at
before update on public.shelter_operations
for each row execute function public.touch_updated_at();

create policy "shelter_operations_select_public"
on public.shelter_operations
for select
to anon, authenticated
using (true);

create policy "shelter_operations_operator_insert"
on public.shelter_operations
for insert
to authenticated
with check (public.has_operator_access());

create policy "shelter_operations_operator_update"
on public.shelter_operations
for update
to authenticated
using (public.has_operator_access())
with check (public.has_operator_access());

create policy "shelter_operations_admin_delete"
on public.shelter_operations
for delete
to authenticated
using (public.current_user_role() = 'admin');

insert into public.shelter_operations (
  id,
  name,
  address,
  lat,
  lng,
  capacity,
  status,
  underground,
  facility_type,
  source,
  checked_at
)
values
  ('s-01', '역삼초등학교 체육관', '서울 강남구 역삼로 153', 37.5005, 127.0354, 420, 'OPERATING', false, '이재민 임시주거시설', '시연 임시주거시설 데이터', '2026-06-11T14:30:00+09:00'),
  ('s-02', '강남구민회관', '서울 강남구 학동로 426', 37.5172, 127.0473, 800, 'OPERATING', false, '이재민 임시주거시설', '시연 임시주거시설 데이터', '2026-06-11T14:30:00+09:00'),
  ('s-03', '도곡중학교', '서울 강남구 남부순환로 2806', 37.4889, 127.0431, 350, 'CHECK_REQUIRED', false, '이재민 임시주거시설', '시연 임시주거시설 데이터', '2026-05-30T09:00:00+09:00'),
  ('s-04', '강남세브란스병원 지하주차장', '서울 강남구 언주로 211', 37.4926, 127.0473, 600, 'EXCLUDED', true, '이재민 임시주거시설', '시연 임시주거시설 데이터', '2026-05-30T09:00:00+09:00'),
  ('s-05', '역삼1동주민센터', '서울 강남구 봉은사로4길 13', 37.5023, 127.0301, 180, 'OPERATING', false, '이재민 임시주거시설', '시연 임시주거시설 데이터', '2026-06-11T14:30:00+09:00'),
  ('s-06', '선릉초등학교', '서울 강남구 선릉로 96길 17', 37.5067, 127.0492, 280, 'OPERATING', false, '이재민 임시주거시설', '시연 임시주거시설 데이터', '2026-06-11T14:30:00+09:00'),
  ('s-07', '삼성2동주민센터', '서울 강남구 영동대로 511', 37.5099, 127.0588, 150, 'CHECK_REQUIRED', false, '이재민 임시주거시설', '시연 임시주거시설 데이터', '2026-05-30T09:00:00+09:00'),
  ('s-08', '역삼중학교', '서울 강남구 도곡로 124', 37.4947, 127.0387, 320, 'OPERATING', false, '이재민 임시주거시설', '시연 임시주거시설 데이터', '2026-06-11T14:30:00+09:00'),
  ('s-09', '대치1동주민센터', '서울 강남구 도곡로 510', 37.4949, 127.0617, 200, 'OPERATING', false, '이재민 임시주거시설', '시연 임시주거시설 데이터', '2026-06-11T14:30:00+09:00'),
  ('s-10', '휘문고등학교', '서울 강남구 역삼로 541', 37.5039, 127.0571, 480, 'OPERATING', false, '이재민 임시주거시설', '시연 임시주거시설 데이터', '2026-06-11T14:30:00+09:00'),
  ('s-11', '강남구청 지하 1층', '서울 강남구 학동로 426', 37.5174, 127.0476, 300, 'EXCLUDED', true, '이재민 임시주거시설', '시연 임시주거시설 데이터', '2026-05-30T09:00:00+09:00'),
  ('s-12', '언주중학교', '서울 강남구 언주로 332', 37.506, 127.0411, 340, 'OPERATING', false, '이재민 임시주거시설', '시연 임시주거시설 데이터', '2026-06-11T14:30:00+09:00')
on conflict (id) do update set
  name = excluded.name,
  address = excluded.address,
  lat = excluded.lat,
  lng = excluded.lng,
  capacity = excluded.capacity,
  status = excluded.status,
  underground = excluded.underground,
  facility_type = excluded.facility_type,
  source = excluded.source,
  checked_at = excluded.checked_at;
