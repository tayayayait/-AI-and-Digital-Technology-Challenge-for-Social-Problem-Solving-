import type { useRiskAssessment } from "@/hooks/useRiskAssessment";
import type { GeminiAlternativeShelter } from "@/lib/api/gemini";
import { freshness } from "@/lib/api/dataTimestamp";
import type { ApiResult } from "@/lib/api/types";
import { RISK_META } from "@/lib/risk";
import type { RiskLevel, RouteResult, SafetyFact, Shelter } from "@/lib/types";

type Assessment = ReturnType<typeof useRiskAssessment>;

const RISK_LEVEL_RANK: Record<RiskLevel, number> = {
  UNKNOWN: -1,
  SAFE: 0,
  WATCH: 1,
  WARNING: 2,
  CRITICAL: 3,
};

const peakRiskOutlook = (assessment: Assessment) =>
  (assessment.riskOutlook ?? []).reduce<(typeof assessment.riskOutlook)[number] | null>(
    (highest, point) => {
      if (!highest) return point;
      const rankDifference = RISK_LEVEL_RANK[point.riskLevel] - RISK_LEVEL_RANK[highest.riskLevel];
      if (rankDifference > 0 || (rankDifference === 0 && point.riskScore > highest.riskScore)) {
        return point;
      }
      return highest;
    },
    null,
  );

const forecastHourLabel = (value: string) => {
  const match = value.match(/T(\d{2}):/);
  return match ? `${Number(match[1])}시 예상` : `${value} 예상`;
};

export const safetyFactStatus = (
  status: string | undefined,
  timestamp: string | null,
  online: boolean,
): SafetyFact["status"] => {
  if (!online || status === "FAILED" || status === "FALLBACK" || !status) return "FALLBACK";
  if (status !== "OK" || freshness(timestamp) === "STALE" || freshness(timestamp) === "UNKNOWN") {
    return "DELAYED";
  }
  return "LIVE";
};

export const getDisasterTypes = (assessment: Assessment): string[] => {
  const evidence = [
    ...assessment.reasons,
    ...(assessment.weatherWarningAlerts ?? []).map((alert) => alert.title),
    ...(assessment.disasterMessageItems ?? []).map((message) => message.body),
  ].join(" ");
  return [
    /호우|폭우/.test(evidence) ? "호우" : null,
    /침수|지하차도/.test(evidence) || assessment.floodTraceOverlap > 0 ? "침수" : null,
    /범람|홍수/.test(evidence) || assessment.riverFloodOverlap > 0 ? "하천 범람" : null,
    evidence.includes("태풍") ? "태풍" : null,
    /산사태/.test(evidence) ? "산사태" : null,
    /지진/.test(evidence) ? "지진" : null,
    /화재/.test(evidence) ? "화재" : null,
    /폭염/.test(evidence) ? "폭염" : null,
  ].filter((type): type is string => type != null);
};

export function buildSituationFacts({
  assessment,
  riskLevel,
  timestamp,
  online,
  route,
  routeResult,
  shelter,
  shelterDistanceMeters,
  shelterDistanceKind,
  shelterResult,
  alternatives,
}: {
  assessment: Assessment;
  riskLevel: RiskLevel;
  timestamp: string | null;
  online: boolean;
  route?: RouteResult;
  routeResult?: ApiResult<RouteResult[]>;
  shelter?: Shelter;
  shelterDistanceMeters?: number;
  shelterDistanceKind?: "ROUTE" | "STRAIGHT_LINE";
  shelterResult?: ApiResult<Shelter[]>;
  alternatives: GeminiAlternativeShelter[];
}): SafetyFact[] {
  const overallStatus = safetyFactStatus(
    assessment.missingDataCount > 0 ? "FALLBACK" : "OK",
    timestamp,
    online,
  );
  const facts: SafetyFact[] = [
    {
      id: "risk-current",
      kind: "RISK",
      text:
        "현재 위험도 " +
        RISK_META[riskLevel].label +
        ", 위험 점수 " +
        assessment.total +
        "점. " +
        (assessment.missingDataCount > 0
          ? "필수 데이터 " +
            assessment.missingDataCount +
            "개 누락: 낮은 점수를 안전 보장으로 해석하지 말 것."
          : "이 점수는 API 근거 종합값이며 현장 안전 보장이 아님."),
      source: "재난·기상·지도 API 종합",
      observedAt: timestamp,
      status: overallStatus,
    },
  ];
  if (route) {
    facts.push({
      id: "route-" + route.id,
      kind: "ROUTE",
      text:
        route.name +
        ", 상태 " +
        route.status +
        ", 경로 거리 " +
        route.distanceMeters +
        "m, 약 " +
        Math.round(route.durationSeconds / 60) +
        "분, 안전점수 " +
        route.safetyScore +
        "점. " +
        route.riskReasons.join(" · "),
      source: route.mode === "WALK" ? "TMAP 보행 경로" : "NAVER 차량 경로",
      observedAt: routeResult?.timestamp ?? timestamp,
      status: safetyFactStatus(routeResult?.status, routeResult?.timestamp ?? null, online),
    });
  }
  if (shelter) {
    facts.push({
      id: "shelter-" + shelter.id,
      kind: "SHELTER",
      text:
        shelter.name +
        ", " +
        shelter.address +
        ", 운영 상태 " +
        shelter.status +
        ", " +
        (shelter.underground ? "지하 시설" : "지상 시설") +
        (typeof shelterDistanceMeters === "number" && Number.isFinite(shelterDistanceMeters)
          ? ", 현재 위치 기준 " +
            (shelterDistanceKind === "ROUTE" ? "경로거리 " : "직선거리 ") +
            Math.round(shelterDistanceMeters) +
            "m"
          : "") +
        ". 운영 여부는 현장 재확인 필요.",
      source: shelterResult?.source ?? "대피소 API",
      observedAt: shelterResult?.timestamp ?? null,
      status: safetyFactStatus(shelterResult?.status, shelterResult?.timestamp ?? null, online),
    });
  }
  alternatives.forEach((alternative) => {
    facts.push({
      id: "alternative-" + alternative.shelterId,
      kind: "SHELTER",
      text:
        alternative.shelterName +
        ", 직선거리 " +
        Math.round(alternative.distanceMeters) +
        "m, 실제 경로 미확인. 직선거리는 이동 거리 또는 도착 시간으로 해석하지 말 것.",
      source: shelterResult?.source ?? "대피소 API · 좌표 간 거리 계산",
      observedAt: shelterResult?.timestamp ?? null,
      status: safetyFactStatus(shelterResult?.status, shelterResult?.timestamp ?? null, online),
    });
  });
  const weather = assessment.weather;
  if (weather && typeof weather === "object") {
    const source = assessment.dataSources.find((item) => item.label.startsWith("기상청"));
    facts.push({
      id: "weather-current",
      kind: "WEATHER",
      text: [
        "시간당 강수량 " + weather.rainfallMmPerHour + "mm",
        weather.temperatureCelsius != null ? "기온 " + weather.temperatureCelsius + "℃" : null,
        weather.humidityPercent != null ? "습도 " + weather.humidityPercent + "%" : null,
      ]
        .filter(Boolean)
        .join(" · "),
      source: source?.label ?? "기상청 단기예보",
      observedAt: weather.observedAt ?? source?.timestamp ?? null,
      status: safetyFactStatus(source?.status, source?.timestamp ?? null, online),
    });
  }
  const forecastPeak = peakRiskOutlook(assessment);
  if (forecastPeak) {
    const source = assessment.dataSources.find((item) => item.label === "기상청 초단기예보");
    facts.push({
      id: "forecast-peak",
      kind: "WEATHER",
      text: [
        forecastHourLabel(forecastPeak.forecastAt),
        "시간당 강수량 " + forecastPeak.rainfallMmPerHour + "mm",
        forecastPeak.precipitationProbabilityPercent != null
          ? "강수확률 " + forecastPeak.precipitationProbabilityPercent + "%"
          : null,
        "예상 위험 " +
          RISK_META[forecastPeak.riskLevel].label +
          " " +
          forecastPeak.riskScore +
          "점",
        "예보 기반이며 현재 침수 사실이 아님",
      ]
        .filter(Boolean)
        .join(" · "),
      source: "기상청 초단기예보 · 위험도 계산",
      observedAt: source?.timestamp ?? timestamp,
      status: safetyFactStatus(source?.status, source?.timestamp ?? timestamp, online),
    });
  }
  (assessment.weatherWarningAlerts ?? []).slice(0, 2).forEach((alert) => {
    facts.push({
      id: "warning-" + alert.id,
      kind: "WARNING",
      text: alert.title + (alert.zone ? " · " + alert.zone : ""),
      source: "기상청 기상특보",
      observedAt: alert.issuedAt,
      status: safetyFactStatus(assessment.weatherWarningStatus, alert.issuedAt, online),
    });
  });
  const disasterSource = assessment.dataSources.find((source) => source.label === "긴급재난문자");
  (assessment.disasterMessageItems ?? []).slice(0, 2).forEach((message, index) => {
    facts.push({
      id: "disaster-message-" + index,
      kind: "DISASTER_MESSAGE",
      text: message.region + " · " + message.body,
      source: message.source ?? "긴급재난문자",
      observedAt: message.issuedAt ?? disasterSource?.timestamp ?? null,
      status: safetyFactStatus(disasterSource?.status, disasterSource?.timestamp ?? null, online),
    });
  });
  (assessment.sensorFeeds ?? [])
    .filter((feed) => feed.status === "ACTIVE")
    .slice(0, 2)
    .forEach((feed) => {
      facts.push({
        id: "sensor-" + feed.id,
        kind: feed.type === "RAINFALL" ? "WEATHER" : "RIVER",
        text: [
          feed.name,
          feed.currentLevel != null ? "수위 " + feed.currentLevel + "m" : null,
          feed.currentRainfallMmPerHour != null
            ? "시간당 강우 " + feed.currentRainfallMmPerHour + "mm"
            : null,
          feed.forecastKind,
          feed.message,
        ]
          .filter(Boolean)
          .join(" · "),
        source: feed.source,
        observedAt: feed.lastObservedAt,
        status: safetyFactStatus("OK", feed.lastObservedAt, online),
      });
    });
  (assessment.trafficEvents ?? []).slice(0, 2).forEach((event) => {
    facts.push({
      id: "traffic-" + event.id,
      kind: "TRAFFIC",
      text: [event.roadName, event.eventDetailType, event.message].filter(Boolean).join(" · "),
      source: event.source,
      observedAt: event.startedAt ?? null,
      status: safetyFactStatus(assessment.trafficEventStatus, event.startedAt ?? null, online),
    });
  });
  assessment.reasons.slice(0, 4).forEach((reason, index) => {
    facts.push({
      id: "assessment-" + index,
      kind: reason.includes("지하차도")
        ? "UNDERPASS"
        : /범람|하천|수위/.test(reason)
          ? "RIVER"
          : /침수.*이력|침수흔적/.test(reason)
            ? "FLOOD_MAP"
            : "RISK",
      text: reason,
      source: "위험도 계산 · API 종합 근거",
      observedAt: timestamp,
      status: overallStatus,
    });
  });
  return facts.slice(0, 20).map((fact) => ({ ...fact, text: fact.text.slice(0, 320) }));
}
