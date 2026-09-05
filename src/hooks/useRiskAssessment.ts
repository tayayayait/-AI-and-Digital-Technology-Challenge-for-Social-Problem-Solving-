import { useEffect, useMemo } from "react";

import type { SourceTimestamp } from "@/lib/api/dataTimestamp";
import { queryNetworkSignal } from "@/lib/offline/networkSignal";
import { calculateRiskScore } from "@/lib/risk/calculateRiskScore";
import { buildRiskOutlook } from "@/lib/risk/forecastRisk";
import { getUnderpassCoverage, hasUnderpassNearby, UNDERPASSES } from "@/lib/risk/underpassRisk";
import { hasBlockingEventNearby, trafficEventReason } from "@/lib/risk/trafficEventRisk";
import type { LatLng, RiskCalculationInput } from "@/lib/types";
import { useScenario } from "@/store/scenario";
import { useDisasterMessages } from "./useDisasterMessages";
import { useReverseGeocode } from "./useReverseGeocode";
import { useSensorFeeds } from "./useSensorFeeds";
import { useTrafficEvents } from "./useTrafficEvents";
import { useWeather } from "./useWeather";
import { useWeatherWarnings } from "./useWeatherWarnings";
import { useWmsOverlap } from "./useWmsOverlap";
import { useOnlineStatus } from "./useOnlineStatus";

export function useRiskAssessment(origin: LatLng) {
  const online = useOnlineStatus();
  const region = useReverseGeocode(origin);
  const {
    result: weatherResult,
    isLoading: isWeatherLoading,
    isFetching: isWeatherFetching,
    isFetchedAfterMount: isWeatherFetchedAfterMount,
  } = useWeather({ origin });
  const {
    result: disasterResult,
    isLoading: isDisasterLoading,
    isFetching: isDisasterFetching,
    isFetchedAfterMount: isDisasterFetchedAfterMount,
  } = useDisasterMessages({ region });
  const { result: warningResult, warnings } = useWeatherWarnings({ region });
  const { floodTraceOverlap, riverFloodOverlap, safeMapEvidence } = useWmsOverlap(origin);
  const { feeds: sensors } = useSensorFeeds(origin);
  const { events: trafficEvents, result: trafficResult } = useTrafficEvents(origin);
  const underpassCoverage = useMemo(() => getUnderpassCoverage(origin), [origin]);
  const hasUnderpass = useMemo(
    () => underpassCoverage.status === "COVERED" && hasUnderpassNearby(origin, UNDERPASSES),
    [origin, underpassCoverage.status],
  );

  const countFailedApis = () => {
    let count = 0;
    if (weatherResult.status === "FAILED") count++;
    if (disasterResult.status === "FAILED" || disasterResult.status === "FALLBACK") count++;
    return count;
  };

  // 침수 관련 특보 중 최고 등급 1건을 근거 문구로 쓴다.
  const floodWarning = warnings.warnings.find(
    (warning) => warning.floodRelevant && warning.level === warnings.floodLevel,
  );
  const blockingTrafficEvent = trafficEvents.find((event) =>
    hasBlockingEventNearby([event], origin),
  );

  const input: RiskCalculationInput = {
    weather: weatherResult.data,
    floodTrace: floodTraceOverlap > 0,
    floodTraceOverlap,
    riverFlood: riverFloodOverlap > 0,
    riverFloodOverlap,
    disasterMessages: disasterResult.data ?? [],
    hasUnderpass,
    trafficControl: hasBlockingEventNearby(trafficEvents, origin),
    trafficControlTitle: blockingTrafficEvent
      ? trafficEventReason(blockingTrafficEvent)
      : undefined,
    floodWarningLevel: warnings.floodLevel,
    floodWarningTitle: floodWarning ? `${floodWarning.phenomenon}${floodWarning.grade}` : undefined,
    sensors,
    failedDataCount: countFailedApis(),
  };

  const breakdown = calculateRiskScore(input);
  const riskOutlook = buildRiskOutlook({
    forecast: weatherResult.data?.hourlyForecast ?? [],
    baseInput: input,
  });
  const dataSources = [
    {
      label: "기상청 초단기예보",
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
  ] satisfies SourceTimestamp[];
  const { setRiskAssessment } = useScenario();
  const isCurrentDataConfirmed =
    online &&
    queryNetworkSignal.isReachable() &&
    isWeatherFetchedAfterMount &&
    isDisasterFetchedAfterMount &&
    !isWeatherLoading &&
    !isWeatherFetching &&
    !isDisasterLoading &&
    !isDisasterFetching;

  useEffect(() => {
    if (!isCurrentDataConfirmed) return;
    setRiskAssessment({ total: breakdown.total, level: breakdown.level });
  }, [breakdown.total, breakdown.level, isCurrentDataConfirmed, setRiskAssessment]);

  return {
    ...breakdown,
    floodTraceOverlap,
    riverFloodOverlap,
    safeMapEvidence,
    region,
    disasterMessageItems: disasterResult.data ?? [],
    sensorFeeds: sensors,
    weather: weatherResult.data,
    weatherWarnings: warnings.warnings,
    weatherWarningAlerts: warnings.alerts,
    weatherWarningStatus: warningResult.status,
    weatherWarningAnnouncedAt: warnings.announcedAt,
    floodWarningLevel: warnings.floodLevel,
    underpassCoverage,
    trafficEvents,
    trafficEventStatus: trafficResult.status,
    riskOutlook,
    dataSources,
    isCurrentDataConfirmed,
  };
}
