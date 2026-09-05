create table public.underpasses (
  id text primary key,
  name text not null check (char_length(btrim(name)) > 0),
  region text not null,
  province text,
  district text,
  address text,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  start_lat double precision not null check (start_lat between -90 and 90),
  start_lng double precision not null check (start_lng between -180 and 180),
  end_lat double precision not null check (end_lat between -90 and 90),
  end_lng double precision not null check (end_lng between -180 and 180),
  road_name text,
  road_direction text,
  length_meters double precision check (length_meters is null or length_meters >= 0),
  management_agency text,
  source text not null,
  source_url text not null,
  source_updated_at date,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index underpasses_lat_lng_idx on public.underpasses (lat, lng);
create index underpasses_region_idx on public.underpasses (province, district);

alter table public.underpasses enable row level security;

grant select on table public.underpasses to anon, authenticated;
grant all on table public.underpasses to service_role;

create policy "Underpasses are viewable by everyone"
on public.underpasses for select
using (true);

comment on table public.underpasses is
  '국토교통부 전국도로터널정보표준데이터 중 좌표가 완전한 차량용 지하차도';
