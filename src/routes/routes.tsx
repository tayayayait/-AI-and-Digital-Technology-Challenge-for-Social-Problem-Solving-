import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useMemo } from "react";
import { ClientMap } from "@/components/map/ClientMap";
import { useScenario } from "@/store/scenario";
import { oldestSuccessfulTimestamp, relativeAge } from "@/lib/api/dataTimestamp";
import type {
  LocationStatus,
  RiskLevel,
  RouteMode,
  RouteResult,
  Shelter,
  TrafficEvent,
} from "@/lib/types";
import { formatDistance, formatDuration, formatTimestamp } from "@/lib/utils";
import { selectDisplayedMode, type RoutesState, useRoutes } from "@/hooks/useRoutes";
import { useShelters } from "@/hooks/useShelters";
import { useTrafficEvents } from "@/hooks/useTrafficEvents";
import { useRiskAssessment } from "@/hooks/useRiskAssessment";

const search = z.object({
  mode: z.enum(["WALK", "DRIVE", "safest"]).optional(),
  auto: z.boolean().optional(),
});

export const routeModeSearch = (mode: RouteMode | "safest", auto = false) =>
  auto ? { mode, auto: true as const } : { mode };
export const canOpenRoutesPage = (locationStatus: LocationStatus) => locationStatus === "GRANTED";

export const Route = createFileRoute("/routes")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "안전 경로 비교 — 침수퇴로 AI" },
      {
        name: "description",
        content: "도보·차량 경로를 안전점수 기준으로 비교하고 추천 경로를 확인합니다.",
      },
    ],
  }),
  component: RoutesPage,
});

function RoutesPage() {
  const { locationStatus } = useScenario();
  const navigate = useNavigate();

  useEffect(() => {
    if (!canOpenRoutesPage(locationStatus)) {
      void navigate({ to: "/", replace: true });
    }
  }, [locationStatus, navigate]);

  if (!canOpenRoutesPage(locationStatus)) {
    return <RouteLocationRequired />;
  }

  return <RoutesPageContent />;
}

function RouteLocationRequired() {
  return (
    <section
      role="status"
      className="mx-4 mt-4 rounded-[12px] border bg-white p-4 text-[13px] font-bold text-[var(--text-muted)]"
      style={{ borderColor: "var(--border-soft)" }}
    >
      홈에서 장소를 선택한 뒤 경로 미리 보기 또는 차량 경로 버튼으로 이동하세요.
    </section>
  );
}

function RoutesPageContent() {
  const { mode: initial, auto } = Route.useSearch();
  const navigate = useNavigate();
  const { origin, riskLevel } = useScenario();

  // Use real shelters
  const { shelters } = useShelters(origin);
  const { events: trafficEvents } = useTrafficEvents(origin);
  const { weather, floodWarningLevel } = useRiskAssessment(origin);
  const routeState = useRoutes({
    origin,
    shelters,
    trafficEvents,
    rainfallMmPerHour: weather?.rainfallMmPerHour,
    floodWarningLevel,
  });
  const autoFocusRecommended = initial === "safest" && auto === true;
  const recommendedMode =
    routeState.routes.find((route) => route.status === "RECOMMENDED")?.mode ??
    selectDisplayedMode("WALK", routeState.routes);
  const mode = initial === "WALK" || initial === "DRIVE" ? initial : recommendedMode;

  const setMode = (nextMode: RouteMode) => {
    void navigate({
      to: "/routes",
      search: routeModeSearch(nextMode),
      replace: true,
    });
  };

  return (
    <RoutesView
      origin={origin}
      mode={mode}
      onModeChange={setMode}
      routeState={routeState}
      shelters={shelters}
      riskLevel={riskLevel}
      trafficEvents={trafficEvents}
      autoFocusRecommended={autoFocusRecommended}
    />
  );
}

export function RoutesView({
  origin,
  mode,
  onModeChange,
  routeState,
  shelters,
  riskLevel = "UNKNOWN",
  trafficEvents = [],
  autoFocusRecommended = false,
}: {
  origin: { lat: number; lng: number };
  mode: RouteMode;
  onModeChange: (m: RouteMode) => void;
  routeState: RoutesState;
  shelters: Shelter[];
  riskLevel?: RiskLevel;
  trafficEvents?: TrafficEvent[];
  autoFocusRecommended?: boolean;
}) {
  const displayedMode = selectDisplayedMode(mode, routeState.routes);
  const list = useMemo(
    () => routeState.routes.filter((r) => r.mode === displayedMode),
    [displayedMode, routeState.routes],
  );
  const shelterById = useMemo(
    () => new Map(shelters.map((shelter) => [shelter.id, shelter])),
    [shelters],
  );
  const { expandedRoutes, collapsedRoutes } = useMemo(() => {
    if (!autoFocusRecommended) return { expandedRoutes: list, collapsedRoutes: [] };
    const focusedRoute =
      list.find((route) => route.status === "RECOMMENDED") ??
      list.find((route) => route.status !== "REJECTED");
    return {
      expandedRoutes: focusedRoute ? [focusedRoute] : [],
      collapsedRoutes: list.filter((route) => route.id !== focusedRoute?.id),
    };
  }, [autoFocusRecommended, list]);
  const visibleOnMap = useMemo(
    () => expandedRoutes.filter((route) => route.status !== "REJECTED"),
    [expandedRoutes],
  );
  const mapShelters = useMemo(() => {
    const selectedRoute =
      visibleOnMap.find((route) => route.status === "RECOMMENDED") ?? visibleOnMap[0];
    const selectedShelter = shelters.find((shelter) => shelter.id === selectedRoute?.shelterId);
    return selectedShelter ? [selectedShelter] : [];
  }, [shelters, visibleOnMap]);
  const hasOnlyRejectedRoutes = list.length > 0 && list.every((r) => r.status === "REJECTED");
  const routeDataTimestamp = oldestSuccessfulTimestamp([
    {
      label: "TMAP 보행자 경로",
      timestamp: routeState.results.walk.timestamp,
      status: routeState.results.walk.status,
    },
    {
      label: "NAVER Directions 5",
      timestamp: routeState.results.drive.timestamp,
      status: routeState.results.drive.status,
    },
  ]);
  const routeDataTimestampLabel = routeDataTimestamp
    ? `${formatTimestamp(routeDataTimestamp)} (${relativeAge(routeDataTimestamp)})`
    : "확실한 정보 없음";

  return (
    <div className="flex flex-col flex-1">
      <div className="px-4 pt-3">
        <ModeSegmented value={mode} onChange={onModeChange} />
      </div>
      <div style={{ height: 280 }} className="mt-3">
        <ClientMap
          center={origin}
          zoom={14}
          shelters={mapShelters}
          routes={visibleOnMap}
          trafficEvents={trafficEvents}
        />
      </div>
      <div className="px-4 py-4 flex flex-col gap-3">
        {routeState.isLoading && (
          <div
            className="rounded-[12px] border bg-white p-4 text-[13px] font-bold text-[var(--text-muted)]"
            style={{ borderColor: "var(--border-soft)" }}
          >
            경로 API 응답을 확인하는 중입니다.
          </div>
        )}
        {routeState.failureMessage ? (
          <StraightLineFallback
            message={routeState.failureMessage}
            shelters={routeState.fallbackShelters}
          />
        ) : hasOnlyRejectedRoutes ? (
          <>
            <NoSafeRouteCard mode={displayedMode} />
            {autoFocusRecommended ? (
              <CollapsedRoutes
                routes={collapsedRoutes}
                shelterById={shelterById}
                riskLevel={riskLevel}
              />
            ) : (
              <>
                <h3 className="mt-1 text-[13px] font-extrabold text-[var(--text-muted)]">
                  제외된 후보 경로
                </h3>
                {list.map((r) => (
                  <RouteCard
                    key={r.id}
                    route={r}
                    shelter={shelterById.get(r.shelterId)}
                    riskLevel={riskLevel}
                  />
                ))}
              </>
            )}
          </>
        ) : (
          <>
            {expandedRoutes.map((r) => (
              <RouteCard
                key={r.id}
                route={r}
                shelter={shelterById.get(r.shelterId)}
                riskLevel={riskLevel}
              />
            ))}
            {autoFocusRecommended ? (
              <CollapsedRoutes
                routes={collapsedRoutes}
                shelterById={shelterById}
                riskLevel={riskLevel}
              />
            ) : null}
          </>
        )}
        <p className="text-[12px] text-[var(--text-subtle)] mt-1 tnum" aria-label="데이터 기준시각">
          데이터 기준 {routeDataTimestampLabel}
        </p>
        <p className="text-[12px] text-[var(--text-subtle)] tnum" aria-label="지하차도 데이터 범위">
          지하차도 데이터: {routeState.underpassCoverage.label}{" "}
          {routeState.underpassCoverage.recordCount}개 ·{" "}
          {routeState.underpassCoverage.dataDate ?? "기준일 미상"} 기준
          {routeState.underpassCoverage.status === "OUTSIDE_COVERAGE"
            ? " · 현재 위치는 데이터 범위 밖"
            : ""}
        </p>
      </div>
    </div>
  );
}

function CollapsedRoutes({
  routes,
  shelterById,
  riskLevel,
}: {
  routes: RouteResult[];
  shelterById: Map<string, Shelter>;
  riskLevel: RiskLevel;
}) {
  if (routes.length === 0) return null;

  return (
    <details
      className="rounded-[12px] border bg-white p-3"
      style={{ borderColor: "var(--border-soft)" }}
    >
      <summary className="cursor-pointer text-[13px] font-extrabold text-[var(--text-muted)]">
        대안·제외 경로 {routes.length}개 보기
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        {routes.map((route) => (
          <RouteCard
            key={route.id}
            route={route}
            shelter={shelterById.get(route.shelterId)}
            riskLevel={riskLevel}
          />
        ))}
      </div>
    </details>
  );
}

function NoSafeRouteCard({ mode }: { mode: RouteMode }) {
  const modeLabel = mode === "WALK" ? "도보" : "차량";
  return (
    <section
      role="status"
      className="rounded-[12px] border p-4"
      style={{ borderColor: "#fca5a5", background: "#fef2f2" }}
    >
      <span
        className="rounded px-2 py-1 text-[12px] font-extrabold"
        style={{ background: "#fee2e2", color: "#991b1b" }}
      >
        안전 경로 없음
      </span>
      <h2 className="mt-3 text-[17px] font-extrabold text-[#991b1b]">{modeLabel} 안전 경로 없음</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-[#7f1d1d]">
        현재 선택한 이동수단의 모든 후보 경로가 제외되었습니다. 경로 상에 위험 구역(침수/범람) 또는{" "}
        <strong>실시간 교통 통제구간(돌발상황)</strong>이 포함되어 있습니다. 지자체 안내와 현장
        통제를 우선하고, 무리한 진입을 삼가세요.
      </p>
    </section>
  );
}

function StraightLineFallback({
  message,
  shelters,
}: {
  message: string;
  shelters: RoutesState["fallbackShelters"];
}) {
  return (
    <section
      className="rounded-[12px] border bg-white p-4"
      style={{ borderColor: "var(--border-soft)" }}
    >
      <p className="text-[14px] font-bold text-[var(--text)]">{message}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {shelters.map(({ shelter, distanceMeters }) => (
          <li key={shelter.id} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="font-bold">{shelter.name}</span>
            <span className="tnum text-[var(--text-muted)]">
              직선거리 {formatDistance(distanceMeters)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ModeSegmented({
  value,
  onChange,
}: {
  value: RouteMode;
  onChange: (m: RouteMode) => void;
}) {
  return (
    <div
      role="tablist"
      className="grid grid-cols-2 bg-[var(--surface-alt)] p-1 rounded-[10px]"
      style={{ height: 40 }}
    >
      {(["WALK", "DRIVE"] as RouteMode[]).map((m) => {
        const active = m === value;
        return (
          <button
            key={m}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m)}
            className="rounded-[8px] font-bold text-[14px] transition-colors"
            style={{
              background: active ? "white" : "transparent",
              color: active ? "var(--text)" : "var(--text-subtle)",
              boxShadow: active ? "0 1px 3px rgba(15,23,42,0.08)" : "none",
            }}
          >
            {m === "WALK" ? "도보" : "차량"}
          </button>
        );
      })}
    </div>
  );
}

function RouteCard({
  route,
  shelter,
  riskLevel,
}: {
  route: RouteResult;
  shelter?: Shelter;
  riskLevel: RiskLevel;
}) {
  const colors: Record<RouteResult["status"], { bg: string; text: string; label: string }> = {
    RECOMMENDED: { bg: "#dbeafe", text: "#1d4ed8", label: "추천" },
    ALTERNATIVE: { bg: "#f1f5f9", text: "#334155", label: "대안" },
    REJECTED: { bg: "#fee2e2", text: "#991b1b", label: "제외" },
    LOADING: { bg: "#f1f5f9", text: "#64748b", label: "계산중" },
    FAILED: { bg: "#fee2e2", text: "#991b1b", label: "실패" },
  };
  const c = colors[route.status];
  return (
    <article
      className="bg-white border rounded-[12px] p-4"
      style={{ borderColor: "var(--border-soft)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="text-[12px] font-extrabold rounded px-2 py-0.5"
            style={{ background: c.bg, color: c.text }}
          >
            {c.label}
          </span>
          <h3 className="text-[16px] font-bold">{route.name}</h3>
        </div>
        <div className="text-right tnum">
          <div className="text-[18px] font-extrabold">{route.safetyScore}점</div>
          <div className="text-[11px] text-[var(--text-subtle)]">안전점수</div>
        </div>
      </div>

      <div className="flex gap-4 mt-2 text-[13px] tnum text-[var(--text-muted)]">
        <span>{formatDuration(route.durationSeconds)}</span>
        <span>{formatDistance(route.distanceMeters)}</span>
      </div>

      {route.riskReasons.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {route.riskReasons.slice(0, 3).map((r) => (
            <li
              key={r}
              className="text-[12px] rounded px-2 py-1.5 flex items-start gap-1.5 leading-snug"
              style={{
                background: route.status === "REJECTED" ? "#fef2f2" : "var(--surface-alt)",
                color: route.status === "REJECTED" ? "#dc2626" : "var(--text-muted)",
                border: route.status === "REJECTED" ? "1px solid #fca5a5" : "none",
                fontWeight: route.status === "REJECTED" ? "bold" : "normal",
              }}
            >
              {route.status === "REJECTED" && <span aria-hidden="true">🚫</span>}
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
