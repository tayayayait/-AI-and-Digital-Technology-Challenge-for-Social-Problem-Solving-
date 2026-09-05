import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClientMap } from "@/components/map/ClientMap";
import { AddressFallback } from "@/components/location/AddressFallback";
import { ActionCard, type AlternativeShelterView } from "@/components/risk/ActionCard";
import { SafeMapEvidencePanel } from "@/components/risk/SafeMapEvidencePanel";
import { WeatherPanel } from "@/components/risk/WeatherPanel";
import { HomeSkeleton } from "@/components/skeletons/HomeSkeleton";
import { LocationPermissionPrompt } from "@/components/location/LocationPermissionPrompt";
import { useScenario } from "@/store/scenario";
import { useWmsLayers } from "@/hooks/useWmsLayers";
import { oldestSuccessfulTimestamp } from "@/lib/api/dataTimestamp";
import { formatDistance, haversineMeters } from "@/lib/utils";
import type { GeocodeResult } from "@/lib/geocoding";
import { useShelters } from "@/hooks/useShelters";
import { useRiskAssessment } from "@/hooks/useRiskAssessment";
import { useAiAdvice } from "@/hooks/useAiAdvice";
import { useRoutes } from "@/hooks/useRoutes";
import { useTrafficEvents } from "@/hooks/useTrafficEvents";
import { useCctvFeeds } from "@/hooks/useCctvFeeds";
import { CCTV_ENABLED } from "@/lib/cctv/config";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Camera } from "lucide-react";
import type { GeminiRouteExplanationInput } from "@/lib/api/gemini";
import { buildSituationFacts, getDisasterTypes } from "@/lib/ai/situationContext";
import type { RouteMode, RouteResult, Shelter } from "@/lib/types";
import { WmsLegend } from "@/components/map/WmsLegend";
import { RISK_META } from "@/lib/risk";
import { EmergencyBar, type EmergencyBarVariant } from "@/components/layout/EmergencyBar";
import { useEmergencyMode } from "@/hooks/useEmergencyMode";

export { LocationPermissionPrompt };

const HOME_SHELTER_STATUS_LABEL: Record<Shelter["status"], string> = {
  OPERATING: "운영중",
  CHECK_REQUIRED: "확인필요",
  EXCLUDED: "제외권고",
};

const HOME_ROUTE_STATUS_LABEL: Record<RouteResult["status"], string> = {
  RECOMMENDED: "추천",
  ALTERNATIVE: "대안",
  REJECTED: "제외",
  LOADING: "계산중",
  FAILED: "실패",
};

const HOME_ROUTE_MODE_LABEL: Record<RouteMode, string> = {
  WALK: "도보",
  DRIVE: "차량",
};

type HomeCctvBounds = { minX: number; maxX: number; minY: number; maxY: number };

const HOME_CCTV_LIMIT = 120;
const HOME_CCTV_BOUNDS_EPSILON = 0.0005;

const areHomeCctvBoundsSimilar = (a: HomeCctvBounds | null, b: HomeCctvBounds) =>
  !!a &&
  Math.abs(a.minX - b.minX) < HOME_CCTV_BOUNDS_EPSILON &&
  Math.abs(a.maxX - b.maxX) < HOME_CCTV_BOUNDS_EPSILON &&
  Math.abs(a.minY - b.minY) < HOME_CCTV_BOUNDS_EPSILON &&
  Math.abs(a.maxY - b.maxY) < HOME_CCTV_BOUNDS_EPSILON;

const formatOverlapEvidence = (label: string, value?: number) => {
  if (!value || value <= 0) return null;
  return `${label} ${Math.round(value * 100)}%`;
};

const uniqueEvidence = (items: Array<string | null | undefined>) => [
  ...new Set(items.filter((item): item is string => Boolean(item))),
];

const selectHomeRoute = (routes: RouteResult[]) =>
  routes.find((route) => route.status === "RECOMMENDED") ??
  routes.find((route) => route.status !== "REJECTED") ??
  routes[0];

const routeTimestamp = (route: RouteResult, results: ReturnType<typeof useRoutes>["results"]) => {
  return route.mode === "WALK" ? results.walk.timestamp : results.drive.timestamp;
};

const buildRouteEvidence = (route: RouteResult | undefined) => {
  if (!route) return [];
  const statusLabel = HOME_ROUTE_STATUS_LABEL[route.status];
  const modeLabel = HOME_ROUTE_MODE_LABEL[route.mode];
  return [
    `${statusLabel} ${modeLabel} 경로 ${route.name}`,
    `안전점수 ${route.safetyScore}점`,
    ...route.riskReasons,
  ];
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "침수퇴로 AI — 홈" },
      {
        name: "description",
        content: "현재 위치 기준 침수 위험도와 가장 안전한 대피소·경로를 한 화면에서 확인하세요.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const {
    riskLevel,
    origin,
    locationStatus,
    setLocationStatus,
    setOrigin,
    apiStatus,
    lastConfirmedAt,
    setLastConfirmedAt,
    lastRecommendation,
    setLastRecommendation,
  } = useScenario();
  const online = useOnlineStatus();
  const [showPerm, setShowPerm] = useState(locationStatus === "PROMPT");
  const [hydrated, setHydrated] = useState(false);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const [selectedShelterId, setSelectedShelterId] = useState<string | null>(null);
  const [selectedShelterOverride, setSelectedShelterOverride] = useState<Shelter | null>(null);
  const [showCctv, setShowCctv] = useState(CCTV_ENABLED);
  const [mapBounds, setMapBounds] = useState<HomeCctvBounds | null>(null);
  const wmsLayers = useWmsLayers();
  const hasSelectedLocation = locationStatus === "GRANTED";
  const isEmergency = useEmergencyMode(riskLevel);
  const displayRiskLevel = isEmergency ? "CRITICAL" : riskLevel;

  const breakdown = useRiskAssessment(origin);
  const currentDataTimestamp = oldestSuccessfulTimestamp(breakdown.dataSources);
  const dataTimestamp = currentDataTimestamp ?? (!online ? lastConfirmedAt : null);
  const updateMapBounds = useCallback((nextBounds: HomeCctvBounds) => {
    setMapBounds((currentBounds) =>
      areHomeCctvBoundsSimilar(currentBounds, nextBounds) ? currentBounds : nextBounds,
    );
  }, []);

  const { cameras: cctvCameras } = useCctvFeeds({
    center: origin,
    bounds: mapBounds,
    limit: HOME_CCTV_LIMIT,
    enabled: CCTV_ENABLED && showCctv && hasSelectedLocation,
  });

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (locationStatus !== "GRANTED") {
      setSelectedShelterId(null);
      setSelectedShelterOverride(null);
    }
    if (locationStatus === "PROMPT") {
      setShowPerm(true);
    }
  }, [locationStatus]);

  // 1) 내 위치 기준 대피소: AI 조언, 기본 추천, 기본 경로 계산용 (항상 내 위치 5km 반경 유지)
  const {
    shelters: originShelters,
    isLoading: isOriginSheltersLoading,
    result: shelterResult,
  } = useShelters(origin, 5000, hasSelectedLocation);

  // 2) 지도 탐색 대피소: 현재 지도 화면 영역(Bounds)에 따른 마커 표시용
  const { shelters: mapShelters } = useShelters(
    origin,
    5000,
    hasSelectedLocation && Boolean(mapBounds),
    mapBounds,
  );

  // 지도에 표시할 마커 대피소 목록 (지도 이동 시 갱신)
  const displayedMapShelters = mapBounds ? mapShelters : originShelters;

  // 모든 알려진 대피소 캐시 (지도에서 선택한 원거리 대피소도 유지)
  const allKnownShelters = useMemo(() => {
    const map = new Map<string, Shelter>();
    for (const s of originShelters) map.set(s.id, s);
    for (const s of mapShelters) map.set(s.id, s);
    if (selectedShelterOverride) {
      map.set(selectedShelterOverride.id, selectedShelterOverride);
    }
    return map;
  }, [originShelters, mapShelters, selectedShelterOverride]);

  const selectedShelter = useMemo(
    () => (selectedShelterId ? allKnownShelters.get(selectedShelterId) : undefined),
    [selectedShelterId, allKnownShelters],
  );

  const { events: trafficEvents } = useTrafficEvents(origin);

  const shelterOptions = useMemo(() => {
    const list = [...originShelters];
    // 사용자가 지도에서 선택한 대피소가 originShelters에 없으면 목록에 추가
    if (selectedShelter && !list.some((s) => s.id === selectedShelter.id)) {
      list.push(selectedShelter);
    }
    return list
      .map((s) => ({
        s,
        d: haversineMeters(origin, s.position),
      }))
      .sort((a, b) => a.d - b.d);
  }, [origin, originShelters, selectedShelter]);

  const fallbackRecommended = useMemo(() => {
    if (originShelters.length === 0) return undefined;
    const sorted = [...originShelters]
      .map((s) => ({ s, d: haversineMeters(origin, s.position) }))
      .sort((a, b) => a.d - b.d);

    return sorted.find(({ s }) => s.status !== "EXCLUDED") ?? sorted[0];
  }, [origin, originShelters]);

  const routeShelters = useMemo(
    () => (selectedShelter ? [selectedShelter] : originShelters),
    [selectedShelter, originShelters],
  );

  const routeState = useRoutes({
    origin,
    shelters: routeShelters,
    trafficEvents,
    rainfallMmPerHour: breakdown.weather?.rainfallMmPerHour,
    floodWarningLevel: breakdown.floodWarningLevel,
    enabled: hasSelectedLocation && routeShelters.length > 0,
  });

  const currentHomeRoute = useMemo(() => selectHomeRoute(routeState.routes), [routeState.routes]);
  const homeRoute =
    currentHomeRoute ?? (!online ? (lastRecommendation?.route ?? undefined) : undefined);
  const routes = useMemo(
    () => (homeRoute && homeRoute.status !== "REJECTED" ? [homeRoute] : []),
    [homeRoute],
  );
  const routeShelter = useMemo(
    () => (homeRoute?.shelterId ? allKnownShelters.get(homeRoute.shelterId) : undefined),
    [homeRoute?.shelterId, allKnownShelters],
  );
  const recommended = useMemo(() => {
    if (selectedShelter) {
      return {
        s: selectedShelter,
        d:
          homeRoute?.shelterId === selectedShelter.id
            ? homeRoute.distanceMeters
            : haversineMeters(origin, selectedShelter.position),
      };
    }
    if (homeRoute && routeShelter) {
      return { s: routeShelter, d: homeRoute.distanceMeters };
    }
    if (!online && lastRecommendation) {
      return {
        s: lastRecommendation.shelter,
        d: lastRecommendation.route?.distanceMeters,
      };
    }
    return fallbackRecommended;
  }, [
    fallbackRecommended,
    homeRoute,
    lastRecommendation,
    online,
    origin,
    routeShelter,
    selectedShelter,
  ]);
  const recommendedShelter = recommended?.s;
  const guidanceRoute = homeRoute?.shelterId === recommendedShelter?.id ? homeRoute : undefined;
  const alternativeShelters = useMemo<AlternativeShelterView[]>(
    () =>
      shelterOptions
        .filter(
          ({ s }) => s.id !== recommendedShelter?.id && s.status !== "EXCLUDED" && !s.underground,
        )
        .slice(0, 2)
        .map(({ s, d }) => ({
          shelter: s,
          distanceMeters: d,
          distanceKind: "STRAIGHT_LINE",
          routeVerified: false,
        })),
    [shelterOptions, recommendedShelter?.id],
  );
  const aiAlternatives = useMemo(
    () =>
      alternativeShelters.map((alternative) => ({
        shelterId: alternative.shelter.id,
        shelterName: alternative.shelter.name,
        distanceMeters: alternative.distanceMeters,
        distanceKind: alternative.distanceKind,
        routeVerified: alternative.routeVerified,
      })),
    [alternativeShelters],
  );
  const disasterTypes = getDisasterTypes(breakdown);
  const facts = buildSituationFacts({
    assessment: breakdown,
    riskLevel: displayRiskLevel,
    timestamp: dataTimestamp,
    online,
    route: guidanceRoute,
    routeResult:
      guidanceRoute?.mode === "WALK" ? routeState.results.walk : routeState.results.drive,
    shelter: recommendedShelter,
    shelterResult,
    alternatives: aiAlternatives,
  });

  const aiRouteReasons = useMemo(
    () =>
      uniqueEvidence([
        ...buildRouteEvidence(homeRoute),
        ...breakdown.reasons,
        formatOverlapEvidence("생활안전지도 침수흔적 중첩", breakdown.floodTraceOverlap),
        formatOverlapEvidence("생활안전지도 하천범람 중첩", breakdown.riverFloodOverlap),
      ]),
    [breakdown.floodTraceOverlap, breakdown.reasons, breakdown.riverFloodOverlap, homeRoute],
  );

  const aiInput = useMemo<GeminiRouteExplanationInput | null>(() => {
    if (!hasSelectedLocation || (!dataTimestamp && !guidanceRoute)) return null;
    return {
      mode: "SITUATION_GUIDANCE",
      question:
        "현재 위험도와 지금 해야 할 행동을 먼저 안내하고, 재난별 행동요령, 대피소 추천 근거, 이동 위험과 대체 후보를 설명하세요. 확인되지 않은 현장 정보는 일반 안전 지식과 구분하세요.",
      riskLevel: displayRiskLevel,
      selectionKind: selectedShelterId ? "USER_SELECTED" : "AUTO_RECOMMENDED",
      recommendedRouteId: guidanceRoute?.id,
      recommendedShelterId: recommended?.s.id,
      shelterName: recommended?.s.name ?? "확인된 대피소 없음",
      distanceMeters: recommended?.d,
      routeReasons: aiRouteReasons,
      dataTimestamp:
        !online && lastConfirmedAt
          ? lastConfirmedAt
          : guidanceRoute
            ? (routeTimestamp(guidanceRoute, routeState.results) ?? dataTimestamp ?? "")
            : (dataTimestamp ?? ""),
      disasterTypes,
      facts,
      alternatives: aiAlternatives,
      allowedProperNouns: [
        guidanceRoute?.name ?? "",
        recommended?.s.name ?? "",
        recommended?.s.address ?? "",
        breakdown.region,
        ...alternativeShelters.flatMap((alternative) => [
          alternative.shelter.name,
          alternative.shelter.address,
        ]),
        ...facts.map((fact) => fact.text),
      ],
    };
  }, [
    aiRouteReasons,
    recommended,
    displayRiskLevel,
    guidanceRoute,
    breakdown,
    routeState.results,
    online,
    lastConfirmedAt,
    hasSelectedLocation,
    dataTimestamp,
    selectedShelterId,
    disasterTypes,
    facts,
    aiAlternatives,
    alternativeShelters,
  ]);

  const { data: aiAdvice, isLoading: isAiLoading } = useAiAdvice(aiInput);
  const hasUsableEmergencyRoute = routeState.routes.some(
    (route) => route.status === "RECOMMENDED" || route.status === "ALTERNATIVE",
  );
  const emergencyVariant: EmergencyBarVariant =
    !isOriginSheltersLoading && originShelters.length === 0
      ? "call"
      : !routeState.isLoading && !hasUsableEmergencyRoute
        ? "shelters"
        : "route";

  const handleEmergencyAction = () => {
    if (emergencyVariant === "shelters") {
      void navigate({ to: "/shelters" });
      return;
    }
    void navigate({
      to: "/routes",
      search: { mode: "safest", auto: true },
    });
  };

  useEffect(() => {
    if (!online || !breakdown.isCurrentDataConfirmed || !currentDataTimestamp) return;
    setLastConfirmedAt(currentDataTimestamp);
  }, [breakdown.isCurrentDataConfirmed, currentDataTimestamp, online, setLastConfirmedAt]);

  const verifiedAdvice = aiAdvice && aiAdvice.verified !== false ? aiAdvice : null;
  const offlineActionTitle = verifiedAdvice?.judgementLabel ?? RISK_META[riskLevel].actionTitle;
  const offlineActionBody = verifiedAdvice?.reasons.length
    ? verifiedAdvice.reasons.join(" ")
    : RISK_META[riskLevel].actionBody;

  useEffect(() => {
    if (
      !online ||
      !breakdown.isCurrentDataConfirmed ||
      !currentDataTimestamp ||
      !recommendedShelter
    ) {
      return;
    }
    setLastRecommendation({
      shelter: recommendedShelter,
      route: currentHomeRoute ?? null,
      actionTitle: offlineActionTitle,
      actionBody: offlineActionBody,
      confirmedAt: currentDataTimestamp,
    });
  }, [
    offlineActionTitle,
    offlineActionBody,
    breakdown.isCurrentDataConfirmed,
    currentDataTimestamp,
    currentHomeRoute,
    online,
    recommendedShelter,
    setLastRecommendation,
  ]);

  if (!hydrated) return <HomeSkeleton />;

  function requestLocation() {
    if (!("geolocation" in navigator)) {
      alert("이 브라우저에서는 위치 정보를 지원하지 않습니다.");
      setLocationStatus("ERROR");
      setShowPerm(false);
      return;
    }

    setIsRequestingLocation(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationStatus("GRANTED");
        setShowPerm(false);
        setIsRequestingLocation(false);
      },
      (error) => {
        setIsRequestingLocation(false);
        if (error.code === error.PERMISSION_DENIED) {
          alert("위치 정보 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용해주세요.");
        } else if (error.code === error.TIMEOUT) {
          alert("위치 정보를 가져오는데 시간이 너무 오래 걸렸습니다. 다시 시도해주세요.");
        } else {
          alert("위치 정보를 가져오지 못했습니다: " + error.message);
        }
        setLocationStatus("DENIED");
        setShowPerm(false);
      },
      { timeout: 15000, enableHighAccuracy: true },
    );
  }

  return (
    <div className="flex flex-col flex-1 relative">
      {isEmergency && <CriticalWarningBanner />}

      {hasSelectedLocation && (
        <ActionCard
          level={displayRiskLevel}
          riskScore={breakdown.total}
          disasterTypes={disasterTypes}
          facts={facts}
          shelter={recommended?.s}
          distanceMeters={recommended?.d}
          distanceKind={guidanceRoute ? "ROUTE" : "STRAIGHT_LINE"}
          route={guidanceRoute}
          alternativeShelters={alternativeShelters}
          timestamp={dataTimestamp}
          apiStatus={routeState.apiStatus ?? apiStatus}
          aiAdvice={aiAdvice ?? undefined}
          isAiLoading={isAiLoading}
          shelterLabel={selectedShelterId ? "선택 대피소" : "추천 대피소"}
          offlineAction={
            !online && lastRecommendation
              ? { title: lastRecommendation.actionTitle, body: lastRecommendation.actionBody }
              : undefined
          }
        />
      )}

      {hasSelectedLocation && (
        <div style={{ height: 320, minHeight: 280 }} className="relative">
          <ClientMap
            center={origin}
            zoom={14}
            shelters={displayedMapShelters}
            routes={routes}
            wmsLayers={wmsLayers}
            selectedShelterId={selectedShelterId}
            onShelterClick={(shelter) => {
              setSelectedShelterOverride(shelter);
              setSelectedShelterId(shelter.id);
            }}
            showCurrentLocationButton
            onCurrentLocationClick={requestLocation}
            isCurrentLocationLoading={isRequestingLocation}
            cctvs={CCTV_ENABLED && showCctv ? cctvCameras : []}
            trafficEvents={trafficEvents}
            onBoundsChanged={updateMapBounds}
          />
          {CCTV_ENABLED && (
            <button
              type="button"
              onClick={() => setShowCctv(!showCctv)}
              className={`absolute left-3 top-3 inline-flex h-10 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-extrabold shadow-sm z-[1000] transition-colors ${
                showCctv
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                  : "border-[var(--border-soft)] bg-white/95 text-[var(--text)]"
              }`}
              aria-pressed={showCctv}
              aria-label="CCTV 켜기/끄기"
            >
              <Camera size={16} aria-hidden />
              CCTV {showCctv ? "끄기" : "켜기"}
            </button>
          )}

          <WmsLegend />
        </div>
      )}

      {hasSelectedLocation && (
        <ShelterPicker
          shelters={shelterOptions}
          selectedShelterId={selectedShelterId}
          isLoading={isOriginSheltersLoading}
          onSelect={(id) => {
            setSelectedShelterId(id);
            if (!id) setSelectedShelterOverride(null);
          }}
        />
      )}

      {!hasSelectedLocation && (
        <div className="px-4 py-4 pb-[220px]">
          <AddressFallback
            onSelect={(result: GeocodeResult) => {
              setOrigin(result.position);
              setLocationStatus("GRANTED");
              setShowPerm(false);
            }}
          />
        </div>
      )}

      {hasSelectedLocation && (
        <WeatherPanel weather={breakdown.weather} warnings={breakdown.weatherWarningAlerts} />
      )}
      {hasSelectedLocation && <SafeMapEvidencePanel evidence={breakdown.safeMapEvidence} />}

      {hasSelectedLocation && isEmergency ? (
        <EmergencyBar
          variant={emergencyVariant}
          onAction={emergencyVariant === "call" ? undefined : handleEmergencyAction}
        />
      ) : null}

      {showPerm && !hasSelectedLocation && (
        <LocationPermissionPrompt
          onAllow={requestLocation}
          onDeny={() => {
            setLocationStatus("DENIED");
            setShowPerm(false);
          }}
          isLoading={isRequestingLocation}
        />
      )}
    </div>
  );
}

export function ShelterPicker({
  shelters,
  selectedShelterId,
  isLoading = false,
  onSelect,
}: {
  shelters: Array<{ s: Shelter; d: number }>;
  selectedShelterId: string | null;
  isLoading?: boolean;
  onSelect: (shelterId: string | null) => void;
}) {
  const selected = selectedShelterId
    ? shelters.find(({ s }) => s.id === selectedShelterId)
    : undefined;
  const disabled = isLoading || shelters.length === 0;

  return (
    <section
      aria-label="대피시설 선택"
      className="border-b border-[var(--border-soft)] bg-white px-4 py-3"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-extrabold text-[var(--text-subtle)]">대피시설</div>
          <div className="mt-0.5 truncate text-[13px] font-bold text-[var(--text)]">
            {selected
              ? `${selected.s.name} · ${HOME_SHELTER_STATUS_LABEL[selected.s.status]}`
              : "가까운 대피소 자동 추천"}
          </div>
        </div>
        <select
          aria-label="홈 대피시설 선택"
          value={selectedShelterId ?? ""}
          disabled={disabled}
          onChange={(event) => onSelect(event.target.value || null)}
          className="h-10 max-w-[190px] rounded-[10px] border border-[var(--border)] bg-white px-3 text-[13px] font-bold text-[var(--text)] disabled:opacity-60"
        >
          <option value="">{isLoading ? "불러오는 중..." : "자동 추천"}</option>
          {shelters.map(({ s, d }) => (
            <option key={s.id} value={s.id}>
              {s.name} · {HOME_SHELTER_STATUS_LABEL[s.status]} · {formatDistance(d)}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

function CriticalWarningBanner() {
  return (
    <div
      role="alert"
      className="bg-[var(--risk-critical-text)] px-4 py-3 text-[13px] font-extrabold text-white"
    >
      심각 단계입니다. 침수·통제 위험 구간을 피하고 가장 가까운 안전 경로를 우선 확인하세요.
    </div>
  );
}
