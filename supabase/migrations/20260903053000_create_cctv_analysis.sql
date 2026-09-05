create type public.cctv_depth_grade as enum ('NONE', 'SHALLOW', 'DEEP', 'IMPASSABLE');

create table public.cctv_analysis (
  id uuid primary key default gen_random_uuid(),
  camera_id text not null,
  camera_name text not null,
  stream_url text not null,
  source text,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  frame_data_url text not null,
  flooded boolean not null,
  depth_grade public.cctv_depth_grade not null,
  passable boolean not null,
  confidence double precision not null check (confidence between 0 and 1),
  observation text not null check (char_length(observation) between 1 and 800),
  model text not null,
  analyzed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at > analyzed_at)
);

create index cctv_analysis_camera_idx
on public.cctv_analysis (camera_id, analyzed_at desc);

create index cctv_analysis_expiry_idx
on public.cctv_analysis (expires_at desc);

create table public.cctv_analysis_usage (
  id uuid primary key default gen_random_uuid(),
  camera_id text not null,
  requested_at timestamptz not null default now()
);

create index cctv_analysis_usage_requested_idx
on public.cctv_analysis_usage (requested_at desc);

create or replace function public.claim_cctv_analysis_usage(
  p_camera_id text,
  p_daily_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_camera_id is null or btrim(p_camera_id) = '' or p_daily_limit < 1 then
    return false;
  end if;

  -- 동일 트랜잭션 잠금 아래에서 카운트와 삽입을 처리해 동시 요청도 상한을 넘지 않게 한다.
  perform pg_advisory_xact_lock(hashtext('cctv_analysis_daily_quota'));

  if (
    select count(*)
    from public.cctv_analysis_usage
    where requested_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
  ) >= p_daily_limit then
    return false;
  end if;

  insert into public.cctv_analysis_usage (camera_id)
  values (p_camera_id);
  return true;
end;
$$;

alter table public.cctv_analysis enable row level security;
alter table public.cctv_analysis_usage enable row level security;

-- Edge Function의 service_role만 캐시와 비용 카운터를 읽고 쓴다.
revoke all on public.cctv_analysis from anon, authenticated;
revoke all on public.cctv_analysis_usage from anon, authenticated;
revoke all on function public.claim_cctv_analysis_usage(text, integer) from public, anon, authenticated;
grant execute on function public.claim_cctv_analysis_usage(text, integer) to service_role;
