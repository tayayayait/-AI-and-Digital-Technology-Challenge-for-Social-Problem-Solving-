import { useQuery } from "@tanstack/react-query";

import { fetchNaverDirectionsRoutes } from "@/lib/api/naverDirections";
import { fetchTmapPedestrianRoutes } from "@/lib/api/tmapPedestrian";
import { routeResultsSchema } from "@/lib/api/routeSchemas";
import { API_CACHE_TTL_MS } from "@/lib/api/cache";
import { measureApiHealth } from "@/lib/api/measureApiHealth";
import { summarizeApiStatus } from "@/hooks/useApiStatus";
import type { ApiResult, ApiStatus } from "@/lib/api/types";
import { rankRoutesByRisk } from "@/lib/risk/routeRanking";
import {
  getUnderpassCoverage,
  UNDERPASSES,
  type UnderpassCoverage,
} from "@/lib/risk/underpassRisk";
import type {
  LatLng,
  RiskCalculationInput,
  RiskZone,
  RouteMode,
  RouteResult,
  Shelter,
  TrafficEvent,
} from "@/lib/types";
import { haversineMeters } from "@/lib/utils";
import { API_HEALTH_SOURCE_NAMES } from "@/store/apiHealth";
import { useAccessibility } from "@/store/accessibility";

export const ROUTE_FAILURE_MESSAGE =
  "경로를 계산하지 못했습니다. 현재 API 응답이 지연되고 있습니다. 가까운 대피소 목록을 먼저 확인하세요.";

export interface StraightLineShelter {
  shelter: Shelter;
  distanceMeters: number;
}

export interface RouteClients {
  naverDirections?: typeof fetchNaverDirectionsRoutes;
  tmapPedestrian?: typeof fetchTmapPedestrianRoutes;
}

export interface RoutesState {
  routes: RouteResult[];
  results: {
    walk: ApiResult<RouteResult[]>;
    drive: ApiResult<RouteResult[]>;
  };
  apiStatus: ApiStatus;
  isLoading: boolean;
  fallbackShelters: StraightLineShelter[];
  underpassCoverage: UnderpassCoverage;
  failureMessage?: string;
}

interface UseRoutesOptions {
  origin: LatLng;
  shelters?: Shelter[];
  riskZones?: RiskZone[];
  trafficEvents?: TrafficEvent[];
  rainfallMmPerHour?: number;
  floodWarningLevel?: RiskCalculationInput["floodWarningLevel"];
  mobilityMode?: boolean;
  clients?: RouteClients;
  enabled?: boolean;
}

const nowIso = () => new Date().toISOString();

const routeResult = (
  source: string,
  status: ApiStatus,
  data: RouteResult[] | null,
  error?: string,
): ApiResult<RouteResult[]> => ({
  data,
  status,
  timestamp: nowIso(),
  source,
  error,
});

export const rankStraightLineShelters = (
  origin: LatLng,
  shelters: Shelter[] = [],
  limit = 5,
): StraightLineShelter[] =>
  shelters
    .filter((shelter) => shelter.status !== "EXCLUDED" && !shelter.underground)
    .map((shelter) => ({
      shelter,
      distanceMeters: Math.round(haversineMeters(origin, shelter.position)),
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);

export const selectDisplayedMode = (requestedMode: RouteMode, routes: RouteResult[]): RouteMode => {
  if (routes.some((route) => route.mode === requestedMode)) return requestedMode;
  if (routes.some((route) => route.mode === "WALK")) return "WALK";
  if (routes.some((route) => route.mode === "DRIVE")) return "DRIVE";
  return requestedMode;
};

const firstReachableShelter = (origin: LatLng, shelters: Shelter[], maxDistance?: number) =>
  rankStraightLineShelters(origin, shelters, shelters.length).find(
    ({ distanceMeters }) => maxDistance == null || distanceMeters <= maxDistance,
  );

const normalizeRoutes = (routes: RouteResult[], shelter: Shelter): RouteResult[] =>
  routeResultsSchema.parse(
    routes.map((route) => ({
      ...route,
      shelterId: shelter.id,
    })),
  );

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Route API failed";

export const loadRoutes = async ({
  origin,
  shelters = [],
  riskZones = [],
  trafficEvents = [],
  rainfallMmPerHour = 0,
  floodWarningLevel = null,
  mobilityMode = false,
  clients = {},
}: UseRoutesOptions): Promise<Omit<RoutesState, "isLoading">> => {
  const walkShelter = firstReachableShelter(origin, shelters, 2500);
  const driveShelter = firstReachableShelter(origin, shelters);
  const fallbackShelters = rankStraightLineShelters(origin, shelters);
  const naverDirections = clients.naverDirections ?? fetchNaverDirectionsRoutes;
  const tmapPedestrian = clients.tmapPedestrian ?? fetchTmapPedestrianRoutes;

  const walkPromise = walkShelter
    ? measureApiHealth({
        name: API_HEALTH_SOURCE_NAMES.tmapPedestrian,
        source: "tmap-pedestrian",
        run: async () => {
          try {
            const routes = await tmapPedestrian({
              origin,
              destination: walkShelter.shelter.position,
              ...(mobilityMode ? { avoidStairs: true } : {}),
            });
            return routeResult(
              "tmap-pedestrian",
              "OK",
              normalizeRoutes(routes, walkShelter.shelter),
            );
          } catch (error) {
            return routeResult("tmap-pedestrian", "FAILED", null, errorMessage(error));
          }
        },
      })
    : Promise.resolve(routeResult("tmap-pedestrian", "FAILED", null, "No shelter within 2500m"));

  const drivePromise = driveShelter
    ? measureApiHealth({
        name: API_HEALTH_SOURCE_NAMES.naverDirections,
        source: "naver-directions",
        run: async () => {
          try {
            const routes = await naverDirections({
              origin,
              destination: driveShelter.shelter.position,
            });
            return routeResult(
              "naver-directions",
              "OK",
              normalizeRoutes(routes, driveShelter.shelter),
            );
          } catch (error) {
            return routeResult("naver-directions", "FAILED", null, errorMessage(error));
          }
        },
      })
    : Promise.resolve(routeResult("naver-directions", "FAILED", null, "No reachable shelter"));

  const [walk, drive] = await Promise.all([walkPromise, drivePromise]);
  const routeCandidates = [...(walk.data ?? []), ...(drive.data ?? [])];
  const routes = rankRoutesByRisk(
    routeCandidates,
    riskZones,
    trafficEvents,
    {
      underpasses: UNDERPASSES,
      rainfallMmPerHour,
      floodWarningLevel,
    },
    { mobilityMode },
  );
  const apiStatus = summarizeApiStatus([walk, drive]);
  const bothFailed = walk.status === "FAILED" && drive.status === "FAILED";

  let failureMessage: string | undefined;
  if (bothFailed) {
    if (shelters.length === 0) {
      failureMessage =
        "주변 반경에 탐색된 대피소가 없습니다. 현재 위치 주변의 공개 대피소 데이터를 확인할 수 없습니다.";
    } else {
      failureMessage = ROUTE_FAILURE_MESSAGE;
    }
  }

  return {
    routes: bothFailed ? [] : routes,
    results: { walk, drive },
    apiStatus,
    fallbackShelters,
    underpassCoverage: getUnderpassCoverage(origin),
    failureMessage,
  };
};

const loadingResult = (source: string): ApiResult<RouteResult[]> => ({
  data: [],
  status: "OK",
  timestamp: new Date(0).toISOString(),
  source,
  error: "Route request is loading",
});

export const useRoutes = ({
  origin,
  shelters = [],
  riskZones = [],
  trafficEvents = [],
  rainfallMmPerHour = 0,
  floodWarningLevel = null,
  mobilityMode: requestedMobilityMode,
  clients,
  enabled = true,
}: UseRoutesOptions): RoutesState => {
  const storedMobilityMode = useAccessibility((state) => state.mobilityMode);
  const mobilityMode = requestedMobilityMode ?? storedMobilityMode;
  const fallbackShelters = rankStraightLineShelters(origin, shelters);
  const query = useQuery({
    queryKey: [
      "routes",
      origin.lat,
      origin.lng,
      shelters.map((shelter) => shelter.id).join(","),
      riskZones.map((zone) => `${zone.id}:${zone.level}`).join(","),
      trafficEvents.map((event) => event.id).join(","),
      rainfallMmPerHour,
      floodWarningLevel,
      mobilityMode,
    ],
    staleTime: API_CACHE_TTL_MS.ROUTE,
    enabled,
    queryFn: () =>
      loadRoutes({
        origin,
        shelters,
        riskZones,
        trafficEvents,
        rainfallMmPerHour,
        floodWarningLevel,
        mobilityMode,
        clients,
      }),
  });

  return {
    routes: query.data?.routes ?? [],
    results: query.data?.results ?? {
      walk: loadingResult("tmap-pedestrian"),
      drive: loadingResult("naver-directions"),
    },
    apiStatus: query.data?.apiStatus ?? "FAILED",
    isLoading: enabled && query.isLoading,
    fallbackShelters: query.data?.fallbackShelters ?? fallbackShelters,
    underpassCoverage: query.data?.underpassCoverage ?? getUnderpassCoverage(origin),
    failureMessage: query.data?.failureMessage,
  };
};
