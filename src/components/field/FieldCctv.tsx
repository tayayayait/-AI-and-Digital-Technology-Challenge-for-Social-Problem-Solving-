import { useMemo, useState } from "react";
import { Camera, ExternalLink, MapPinned, RadioTower } from "lucide-react";

import { ClientMap } from "@/components/map/ClientMap";
import { OpsLayout } from "@/components/ops/OpsLayout";
import { useCctvFeeds } from "@/hooks/useCctvFeeds";
import type { CctvFeed } from "@/lib/api/cctvInfo";
import { CCTV_ENABLED } from "@/lib/cctv/config";
import type { LatLng } from "@/lib/types";

type CctvBounds = { minX: number; maxX: number; minY: number; maxY: number };

// 0.2도 단위(약 22km)로 바운딩 박스를 양자화(Quantize)하여
// 지도를 조금만 이동해도 불필요하게 API를 재호출하는 현상을 방지합니다.
const quantizeBounds = (bounds: CctvBounds, resolution: number = 0.2): CctvBounds => {
  // 부동소수점 오차 방지를 위해 toFixed 적용 후 파싱
  return {
    minX: Number((Math.floor(bounds.minX / resolution) * resolution).toFixed(4)),
    maxX: Number((Math.ceil(bounds.maxX / resolution) * resolution).toFixed(4)),
    minY: Number((Math.floor(bounds.minY / resolution) * resolution).toFixed(4)),
    maxY: Number((Math.ceil(bounds.maxY / resolution) * resolution).toFixed(4)),
  };
};

export const NATIONAL_CCTV_BOUNDS: CctvBounds = {
  minX: 124,
  maxX: 132,
  minY: 33,
  maxY: 39.6,
};

export const NATIONAL_CCTV_CENTER: LatLng = {
  lat: (NATIONAL_CCTV_BOUNDS.minY + NATIONAL_CCTV_BOUNDS.maxY) / 2,
  lng: (NATIONAL_CCTV_BOUNDS.minX + NATIONAL_CCTV_BOUNDS.maxX) / 2,
};

export const SEOUL_CCTV_BOUNDS: CctvBounds = {
  minX: 126.73,
  maxX: 127.27,
  minY: 37.41,
  maxY: 37.72,
};

export const SEOUL_CCTV_CENTER: LatLng = {
  lat: 37.5665,
  lng: 126.978,
};

export const REGION_GROUPS = [
  {
    label: "수도권",
    items: [
      { name: "서울", lat: 37.5665, lng: 126.978, zoom: 12 },
      { name: "경기", lat: 37.2748, lng: 127.0094, zoom: 10 },
      { name: "인천", lat: 37.4563, lng: 126.7052, zoom: 12 },
    ],
  },
  {
    label: "강원권",
    items: [{ name: "강원", lat: 37.7556, lng: 128.8961, zoom: 10 }],
  },
  {
    label: "충청권",
    items: [
      { name: "대전", lat: 36.3504, lng: 127.3845, zoom: 12 },
      { name: "세종", lat: 36.4801, lng: 127.289, zoom: 12 },
      { name: "충남", lat: 36.6588, lng: 126.6728, zoom: 11 },
      { name: "충북", lat: 36.6356, lng: 127.4913, zoom: 11 },
    ],
  },
  {
    label: "전라권",
    items: [
      { name: "광주", lat: 35.1595, lng: 126.8526, zoom: 12 },
      { name: "전남", lat: 34.8161, lng: 126.4629, zoom: 10 },
      { name: "전북", lat: 35.8242, lng: 127.148, zoom: 11 },
    ],
  },
  {
    label: "경상권",
    items: [
      { name: "부산", lat: 35.1796, lng: 129.0756, zoom: 12 },
      { name: "대구", lat: 35.8714, lng: 128.6014, zoom: 12 },
      { name: "울산", lat: 35.5384, lng: 129.3114, zoom: 12 },
      { name: "경남", lat: 35.2383, lng: 128.6922, zoom: 10 },
      { name: "경북", lat: 36.576, lng: 128.5056, zoom: 10 },
    ],
  },
  {
    label: "제주권",
    items: [{ name: "제주", lat: 33.389, lng: 126.5522, zoom: 10 }],
  },
];

export const NATIONAL_CCTV_LIMIT = 5000;
const INITIAL_CCTV_LIST_SIZE = 24;
const MAX_CCTV_MAP_MARKERS = 250;

const sampleCctvsForMap = (cameras: CctvFeed[], limit: number): CctvFeed[] => {
  if (limit <= 0) return [];
  if (cameras.length <= limit) return cameras;

  return Array.from({ length: limit }, (_, index) => {
    const cameraIndex = Math.floor((index * cameras.length) / limit);
    return cameras[cameraIndex]!;
  });
};

const cctvTypeLabel = (type: string) =>
  ({
    "1": "HLS",
    "2": "MP4",
    "3": "정지영상",
    "4": "HTTPS HLS",
    "5": "HTTPS MP4",
  })[type] ?? type;

const formatBounds = (bounds: CctvBounds) =>
  `경도 ${bounds.minX.toFixed(1)}-${bounds.maxX.toFixed(1)}, 위도 ${bounds.minY.toFixed(
    1,
  )}-${bounds.maxY.toFixed(1)}`;

export const getNationwideCctvDescription = () => "전국 CCTV 위치 기준 · 사용자 선택 위치 미사용";

export const getDynamicCctvDescription = () => "현재 지도 영역 기준 · 지도 이동 시 자동 갱신";

export function FieldCctv() {
  if (!CCTV_ENABLED) {
    return (
      <OpsLayout
        title="전국 CCTV"
        description="현재 CCTV 기능이 비활성화되어 있습니다."
        detail={null}
      >
        <section className="rounded-[8px] border border-[var(--border-soft)] bg-white p-4">
          <p role="status" className="text-[14px] text-[var(--text-muted)]">
            CCTV 조회가 꺼져 있습니다.
          </p>
        </section>
      </OpsLayout>
    );
  }

  return <EnabledFieldCctv />;
}

function EnabledFieldCctv() {
  const [currentBounds, setCurrentBounds] = useState<CctvBounds>(NATIONAL_CCTV_BOUNDS);
  const [currentCenter, setCurrentCenter] = useState<LatLng>(NATIONAL_CCTV_CENTER);
  const [currentZoom, setCurrentZoom] = useState(7);
  const [selectedRegion, setSelectedRegion] = useState("전국");
  const [visibleCameraCount, setVisibleCameraCount] = useState(INITIAL_CCTV_LIST_SIZE);

  const handleRegionChange = (regionName: string) => {
    setSelectedRegion(regionName);
    const region = REGION_GROUPS.flatMap((g) => g.items).find((r) => r.name === regionName);
    if (region) {
      setVisibleCameraCount(INITIAL_CCTV_LIST_SIZE);
      setCurrentCenter({ lat: region.lat, lng: region.lng });
      setCurrentZoom(region.zoom);

      // 지역 버튼 클릭 시 지도가 이동하기 전이라도, 해당 지역의 대략적인 영역을
      // 미리 계산하여 즉각(Instant) CCTV 데이터를 캐싱 및 조회하도록 처리합니다.
      const span = region.zoom >= 12 ? 0.1 : 0.6;
      const instantBounds = quantizeBounds({
        minX: region.lng - span,
        maxX: region.lng + span,
        minY: region.lat - span,
        maxY: region.lat + span,
      });
      setCurrentBounds(instantBounds);
    }
  };

  const handleBoundsChanged = (bounds: CctvBounds) => {
    const qBounds = quantizeBounds(bounds);
    if (
      currentBounds.minX === qBounds.minX &&
      currentBounds.maxX === qBounds.maxX &&
      currentBounds.minY === qBounds.minY &&
      currentBounds.maxY === qBounds.maxY
    ) {
      return; // 바운딩 박스가 동일한 캐시 그리드 내에 있으면 상태 업데이트 무시 (재호출 방지)
    }

    setVisibleCameraCount(INITIAL_CCTV_LIST_SIZE);
    setCurrentBounds(qBounds);
  };

  const { cameras, result, isLoading } = useCctvFeeds({
    bounds: currentBounds,
    limit: NATIONAL_CCTV_LIMIT,
    roadType: "all",
  });
  const visibleCameras = cameras.slice(0, visibleCameraCount);
  const mapCameras = useMemo(() => sampleCctvsForMap(cameras, MAX_CCTV_MAP_MARKERS), [cameras]);
  const nextCameraCount = Math.min(
    INITIAL_CCTV_LIST_SIZE,
    Math.max(0, cameras.length - visibleCameras.length),
  );

  return (
    <OpsLayout
      title="전국 CCTV"
      description="현재 지도 영역의 ITS CCTV 위치를 빠르게 조회해 지도에 표시합니다."
      detail={<CctvDetail cameras={cameras} isLoading={isLoading} status={result.status} />}
    >
      <section className="rounded-[8px] border border-[var(--border-soft)] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[16px] font-extrabold">현재 영역 CCTV 위치</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
              {getDynamicCctvDescription()}
            </p>
          </div>
          <span className="rounded bg-[var(--surface-alt)] px-2 py-1 text-[12px] font-extrabold text-[var(--text-muted)]">
            {isLoading ? "조회 중" : `${cameras.length.toLocaleString()}개`}
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-2 rounded-[8px] border border-[var(--border-soft)] bg-white p-3 shadow-sm transition-all hover:shadow-md">
          <div className="text-[12px] font-extrabold tracking-wider text-[var(--text-subtle)]">
            지역 빠른 이동
          </div>
          <div className="relative w-full">
            <div className="flex w-full items-center gap-4 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {REGION_GROUPS.map((group, groupIdx) => (
                <div key={group.label} className="flex items-center gap-3">
                  {groupIdx > 0 ? <div className="h-4 w-px bg-slate-200" aria-hidden /> : null}
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-[11px] font-bold text-slate-400">
                      {group.label}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {group.items.map((region) => {
                        const isSelected = selectedRegion === region.name;
                        return (
                          <button
                            key={region.name}
                            onClick={() => handleRegionChange(region.name)}
                            className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-all duration-200 ${
                              isSelected
                                ? "border-[var(--primary)] bg-[var(--primary)] text-white shadow-sm ring-2 ring-[var(--primary)]/20"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            {region.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white to-transparent" />
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-[8px] border border-[var(--border-soft)]">
          <ClientMap
            center={currentCenter}
            zoom={currentZoom}
            height={640}
            cctvs={mapCameras}
            showCenterMarker={false}
            onBoundsChanged={handleBoundsChanged}
            onCenterChanged={setCurrentCenter}
          />
        </div>

        {mapCameras.length < cameras.length ? (
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--text-muted)]">
            빠른 지도 조작을 위해 조회된 {cameras.length.toLocaleString()}개 중{" "}
            {mapCameras.length.toLocaleString()}개 위치를 고르게 표시합니다. 지도를 확대하거나
            이동하면 해당 영역을 다시 조회합니다.
          </p>
        ) : null}

        <div className="mt-4 rounded-[8px] border border-[var(--border-soft)] bg-[var(--surface-alt)] p-3">
          <div className="flex items-start gap-2">
            <MapPinned size={17} className="mt-0.5 shrink-0 text-[var(--primary)]" aria-hidden />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-extrabold">조회 범위: 현재 지도 영역</div>
              <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                홈 위치, 지도 선택 위치, 현재 위치는 CCTV 조회 조건에 사용하지 않습니다.
              </div>
              <div className="mt-1 text-[12px] text-[var(--text-subtle)]">
                Bounding box {formatBounds(currentBounds)}
              </div>
            </div>
          </div>
        </div>

        {!isLoading && result.status !== "OK" ? (
          <div className="mt-4 rounded-[8px] border border-[var(--border-soft)] bg-[var(--surface-alt)] p-3 text-[13px] text-[var(--text-muted)]">
            ITS CCTV 인증키 승인 대기 또는 미설정 상태입니다. 승인 후 `.env`에 `ITS_CCTV_API_KEY`
            또는 `ITS_API_KEY`를 넣고 Supabase secret을 다시 등록해야 작동합니다.
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {visibleCameras.map((camera) => (
            <CctvCard key={camera.id} camera={camera} />
          ))}
        </div>

        {nextCameraCount > 0 ? (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() =>
                setVisibleCameraCount((count) =>
                  Math.min(count + INITIAL_CCTV_LIST_SIZE, cameras.length),
                )
              }
              className="min-h-10 rounded-[8px] border border-[var(--border-soft)] bg-white px-4 text-[13px] font-extrabold text-[var(--primary)] shadow-sm hover:bg-[var(--surface-alt)]"
            >
              CCTV {nextCameraCount.toLocaleString()}개 더 보기
            </button>
          </div>
        ) : null}

        {!isLoading && cameras.length === 0 && result.status === "OK" ? (
          <p className="mt-4 text-[13px] text-[var(--text-muted)]">
            현재 지도 영역에서 조회된 CCTV가 없습니다.
          </p>
        ) : null}
      </section>
    </OpsLayout>
  );
}

function CctvCard({ camera }: { camera: CctvFeed }) {
  return (
    <article className="min-w-0 rounded-[8px] border border-[var(--border-soft)] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-extrabold">{camera.name}</h3>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">
            {camera.format} · {cctvTypeLabel(camera.cctvType)} · {camera.source}
          </p>
        </div>
        <Camera size={18} className="shrink-0 text-[var(--primary)]" aria-hidden />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
        <div>
          <dt className="font-bold text-[var(--text-subtle)]">좌표</dt>
          <dd className="mt-0.5 tnum">
            {camera.position.lat.toFixed(5)}, {camera.position.lng.toFixed(5)}
          </dd>
        </div>
        <div>
          <dt className="font-bold text-[var(--text-subtle)]">생성시각</dt>
          <dd className="mt-0.5 tnum">{camera.fileCreatedAt ?? "확실한 정보 없음"}</dd>
        </div>
      </dl>
      <a
        href={camera.streamUrl}
        target="_blank"
        rel="noopener"
        className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-[8px] bg-[var(--primary)] px-3 text-[13px] font-extrabold text-white"
      >
        <ExternalLink size={15} aria-hidden />
        영상 열기
      </a>
    </article>
  );
}

function CctvDetail({
  cameras,
  isLoading,
  status,
}: {
  cameras: CctvFeed[];
  isLoading: boolean;
  status: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="inline-flex rounded bg-[var(--surface-alt)] px-2 py-1 text-[12px] font-extrabold text-[var(--text-muted)]">
          {isLoading ? "LOADING" : status}
        </div>
        <h3 className="mt-2 text-[18px] font-extrabold">ITS CCTV</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
          현재 지도에 표시되는 영역(bounding box) 기준으로 HTTPS HLS 유형을 우선 조회합니다.
        </p>
      </div>
      <div className="rounded-[8px] bg-[var(--surface-alt)] p-3">
        <RadioTower size={16} className="text-[var(--primary)]" aria-hidden />
        <div className="mt-2 text-[11px] font-bold text-[var(--text-subtle)]">조회 결과</div>
        <div className="mt-0.5 text-[18px] font-extrabold">
          {isLoading ? "조회 중" : `${cameras.length.toLocaleString()}개`}
        </div>
        <div className="mt-1 truncate text-[12px] text-[var(--text-muted)]">
          현재 영역 조회 · 최대 {NATIONAL_CCTV_LIMIT.toLocaleString()}개 수집
        </div>
      </div>
    </div>
  );
}
