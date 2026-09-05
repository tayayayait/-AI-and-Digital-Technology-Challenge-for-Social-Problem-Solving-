import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { oldestSuccessfulTimestamp } from "@/lib/api/dataTimestamp";
import { createBoundsFromCenter } from "@/lib/map/wms";
import {
  buildRiskZones,
  RISK_ZONE_WMS_CACHE_MS,
  type RiskZoneBuildResult,
  type RiskZoneOverlapCache,
} from "@/lib/ops/riskZoneBuilder";
import { useScenario } from "@/store/scenario";
import { useDisasterMessages } from "./useDisasterMessages";
import { useReverseGeocode } from "./useReverseGeocode";
import { useSensorFeeds } from "./useSensorFeeds";
import { useShelters } from "./useShelters";
import { useTrafficEvents } from "./useTrafficEvents";
import { useWeather } from "./useWeather";
import { useWeatherWarnings } from "./useWeatherWarnings";

const DEFAULT_RISK_AREA_RADIUS_METERS = 1_500;
const overlapCache: RiskZoneOverlapCache = new Map();

const emptyBuildResult: RiskZoneBuildResult = {
  zones: [],
  status: "EMPTY",
  sampledCells: 0,
  failedCells: 0,
};

export function useDynamicRiskZones() {
  const origin = useScenario((state) => state.origin);
  const locationStatus = useScenario((state) => state.locationStatus);
  const hasSelectedLocation = locationStatus === "GRANTED";
  const coordinateRegion = `선택 위치 ${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}`;
  const region = useReverseGeocode(origin, coordinateRegion);
  const bounds = useMemo(
    () => createBoundsFromCenter(origin, DEFAULT_RISK_AREA_RADIUS_METERS),
    [origin],
  );

  const { shelters, isLoading: isSheltersLoading } = useShelters(
    origin,
    5_000,
    hasSelectedLocation,
  );
  const {
    events: trafficEvents,
    result: trafficResult,
    isLoading: isTrafficLoading,
  } = useTrafficEvents(origin, hasSelectedLocation);
  const { feeds: sensors, isLoading: isSensorsLoading } = useSensorFeeds(
    hasSelectedLocation ? origin : undefined,
  );
  const { result: weatherResult, isLoading: isWeatherLoading } = useWeather({
    origin,
    enabled: hasSelectedLocation,
  });
  const {
    result: warningResult,
    warnings,
    isLoading: isWarningsLoading,
  } = useWeatherWarnings({ region, enabled: hasSelectedLocation });
  const { result: disasterResult, isLoading: isDisasterLoading } = useDisasterMessages({
    region,
    enabled: hasSelectedLocation,
  });

  const signalsLoading =
    isSheltersLoading ||
    isTrafficLoading ||
    isSensorsLoading ||
    isWeatherLoading ||
    isWarningsLoading ||
    isDisasterLoading;
  const floodWarning = warnings.warnings.find(
    (warning) => warning.floodRelevant && warning.level === warnings.floodLevel,
  );
  const liveWeather = weatherResult.status === "OK" ? weatherResult.data : null;
  const liveMessages = disasterResult.status === "OK" ? (disasterResult.data ?? []) : [];
  const failedDataCount = [warningResult.status, disasterResult.status].filter(
    (status) => status === "FAILED" || status === "FALLBACK",
  ).length;

  const query = useQuery({
    queryKey: [
      "ops-dynamic-risk-zones",
      bounds,
      region,
      weatherResult.status,
      weatherResult.timestamp,
      warningResult.status,
      warningResult.timestamp,
      disasterResult.status,
      disasterResult.timestamp,
      trafficResult.status,
      trafficResult.timestamp,
      sensors.map((sensor) => `${sensor.id}:${sensor.lastObservedAt ?? "none"}`),
      trafficEvents.map((event) => event.id),
    ],
    enabled: hasSelectedLocation && !signalsLoading,
    staleTime: RISK_ZONE_WMS_CACHE_MS,
    queryFn: () =>
      buildRiskZones({
        bounds,
        regionName: region,
        cache: overlapCache,
        signals: {
          weather: liveWeather,
          disasterMessages: liveMessages,
          sensors,
          trafficEvents,
          floodWarningLevel: warnings.floodLevel,
          floodWarningTitle: floodWarning
            ? `${floodWarning.phenomenon}${floodWarning.grade}`
            : undefined,
          failedDataCount,
        },
      }),
  });

  const buildResult = query.data ?? emptyBuildResult;
  const status = !hasSelectedLocation
    ? ("IDLE" as const)
    : signalsLoading || query.isLoading
      ? ("LOADING" as const)
      : query.isError
        ? ("FAILED" as const)
        : buildResult.status;
  const dataTimestamp = oldestSuccessfulTimestamp([
    {
      label: "기상청 단기예보",
      timestamp: weatherResult.timestamp,
      status: weatherResult.status,
    },
    {
      label: "기상청 기상특보",
      timestamp: warningResult.timestamp,
      status: warningResult.status,
    },
    {
      label: "긴급재난문자",
      timestamp: disasterResult.timestamp,
      status: disasterResult.status,
    },
  ]);

  return {
    riskZones: buildResult.zones,
    status,
    isLoading: status === "LOADING",
    error: query.error instanceof Error ? query.error.message : null,
    sampledCells: buildResult.sampledCells,
    failedCells: buildResult.failedCells,
    region,
    bounds,
    shelters,
    trafficEvents,
    dataTimestamp,
  };
}
