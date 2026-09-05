CREATE TABLE public.cctv_cameras (
  id text PRIMARY KEY,
  name text NOT NULL,
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  stream_url text NOT NULL,
  cctv_type text,
  format text,
  source text,
  updated_at timestamp with time zone DEFAULT now()
);

-- 인덱스 생성: bounding box 조회를 빠르게 하기 위해 복합 인덱스 사용
CREATE INDEX idx_cctv_cameras_lat_lng ON public.cctv_cameras (lat, lng);

-- RLS 정책 설정 (공개 조회 허용)
ALTER TABLE public.cctv_cameras ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.cctv_cameras TO anon, authenticated;
GRANT ALL ON TABLE public.cctv_cameras TO service_role;

CREATE POLICY "CCTV cameras are viewable by everyone"
ON public.cctv_cameras FOR SELECT
USING (true);

-- API나 스케줄러(Edge Function)에서 접근해야 하므로 service_role 권한 허용 (Upsert 용도)
CREATE POLICY "CCTV cameras are insertable by service role"
ON public.cctv_cameras FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "CCTV cameras are updatable by service role"
ON public.cctv_cameras FOR UPDATE
TO service_role
USING (true);
