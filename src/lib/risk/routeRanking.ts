import type { LatLng, RiskZone, RouteResult, TrafficEvent } from "@/lib/types";
import { classifyTrafficEvent, trafficEventReason } from "./trafficEventRisk";
import { distanceToRouteMeters } from "./routeDistance";
import { assessUnderpassRouteRisk, type UnderpassRiskContext } from "./underpassRisk";

export { distanceToRouteMeters } from "./routeDistance";

const zonePenalty: Record<RiskZone["level"], number> = {
  SAFE: 0,
  WATCH: 12,
  WARNING: 28,
  CRITICAL: 80,
};

const TRAFFIC_EVENT_MATCH_RADIUS_M = 120;
const TRAFFIC_EVENT_BLOCKING_PENALTY = 45;
const TRAFFIC_EVENT_CAUTION_PENALTY = 18;
export const MOBILITY_WALKING_SPEED_M_PER_MIN = 45;

export interface RouteAccessibilityContext {
  mobilityMode?: boolean;
}

const toPoint = (point: LatLng) => [point.lng, point.lat] as const;

const orientation = (
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
) => {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  if (Math.abs(value) < 1e-10) return 0;
  return value > 0 ? 1 : 2;
};

const onSegment = (
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
) =>
  b[0] <= Math.max(a[0], c[0]) &&
  b[0] >= Math.min(a[0], c[0]) &&
  b[1] <= Math.max(a[1], c[1]) &&
  b[1] >= Math.min(a[1], c[1]);

const segmentsIntersect = (
  a1: readonly [number, number],
  a2: readonly [number, number],
  b1: readonly [number, number],
  b2: readonly [number, number],
) => {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a1, b1, a2)) return true;
  if (o2 === 0 && onSegment(a1, b2, a2)) return true;
  if (o3 === 0 && onSegment(b1, a1, b2)) return true;
  return o4 === 0 && onSegment(b1, a2, b2);
};

const pointInPolygon = (point: readonly [number, number], polygon: Array<[number, number]>) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersects =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
};

export const routeIntersectsRiskZone = (route: RouteResult, zone: RiskZone) => {
  if (route.geometry.some((point) => pointInPolygon(toPoint(point), zone.polygon))) return true;

  const routeSegments = route.geometry
    .slice(1)
    .map((point, index) => [toPoint(route.geometry[index]), toPoint(point)] as const);
  const polygonSegments = zone.polygon.map(
    (point, index) => [point, zone.polygon[(index + 1) % zone.polygon.length]] as const,
  );

  return routeSegments.some(([routeStart, routeEnd]) =>
    polygonSegments.some(([zoneStart, zoneEnd]) =>
      segmentsIntersect(routeStart, routeEnd, zoneStart, zoneEnd),
    ),
  );
};

const routeRisk = (route: RouteResult, riskZones: RiskZone[]) => {
  const matchedZones = riskZones.filter((zone) => routeIntersectsRiskZone(route, zone));
  const penalty = matchedZones.reduce((sum, zone) => sum + zonePenalty[zone.level], 0);
  const rejected = matchedZones.some((zone) => zone.level === "CRITICAL");
  const reasons = matchedZones
    .flatMap((zone) => [zone.name, ...zone.reasons])
    .filter((reason, index, all) => all.indexOf(reason) === index)
    .slice(0, 3);
  return { penalty, rejected, reasons };
};

const routeTrafficRisk = (route: RouteResult, trafficEvents: TrafficEvent[]) => {
  const matchedEvents = trafficEvents.filter(
    (event) =>
      classifyTrafficEvent(event) !== "INFO" &&
      distanceToRouteMeters(event, route) <= TRAFFIC_EVENT_MATCH_RADIUS_M,
  );
  const hasBlockingEvent = matchedEvents.some(
    (event) => classifyTrafficEvent(event) === "BLOCKING",
  );

  const reasons = matchedEvents
    .map(trafficEventReason)
    .filter((reason, index, all) => all.indexOf(reason) === index)
    .slice(0, 3);

  return {
    penalty:
      matchedEvents.length === 0
        ? 0
        : hasBlockingEvent
          ? TRAFFIC_EVENT_BLOCKING_PENALTY
          : TRAFFIC_EVENT_CAUTION_PENALTY,
    rejected: hasBlockingEvent,
    reasons,
  };
};

export const rankRoutesByRisk = (
  routes: RouteResult[],
  riskZones: RiskZone[],
  trafficEvents: TrafficEvent[] = [],
  underpassContext: UnderpassRiskContext = {},
  accessibilityContext: RouteAccessibilityContext = {},
): RouteResult[] => {
  const evaluated = routes.map((route) => {
    const risk = routeRisk(route, riskZones);
    const traffic = routeTrafficRisk(route, trafficEvents);
    const underpass = assessUnderpassRouteRisk(route, underpassContext.underpasses ?? [], {
      rainfallMmPerHour: underpassContext.rainfallMmPerHour,
      floodWarningLevel: underpassContext.floodWarningLevel,
    });
    const usesMobilityWalkingSpeed = accessibilityContext.mobilityMode && route.mode === "WALK";
    const mobilityDurationSeconds = usesMobilityWalkingSpeed
      ? Math.ceil((route.distanceMeters / MOBILITY_WALKING_SPEED_M_PER_MIN) * 60)
      : route.durationSeconds;
    const rejected = risk.rejected || traffic.rejected || underpass.rejected;
    return {
      onlyUnderpassRejected: underpass.rejected && !risk.rejected && !traffic.rejected,
      route: {
        ...route,
        durationSeconds: Math.max(route.durationSeconds, mobilityDurationSeconds),
        status: rejected ? ("REJECTED" as const) : ("ALTERNATIVE" as const),
        safetyScore: Math.max(
          0,
          Math.min(100, route.safetyScore - risk.penalty - traffic.penalty - underpass.penalty),
        ),
        riskReasons: [
          ...(usesMobilityWalkingSpeed ? ["이동약자 기준 45m/분으로 도착시간 재계산"] : []),
          ...underpass.reasons,
          ...traffic.reasons,
          ...risk.reasons,
          ...route.riskReasons,
        ]
          .filter((reason, index, all) => all.indexOf(reason) === index)
          .slice(0, 3),
      },
    };
  });

  const driveCandidates = evaluated.filter(({ route }) => route.mode === "DRIVE");
  if (
    driveCandidates.length > 0 &&
    driveCandidates.every(({ route }) => route.status === "REJECTED")
  ) {
    const fallback = driveCandidates
      .filter(({ onlyUnderpassRejected }) => onlyUnderpassRejected)
      .sort(
        (a, b) =>
          b.route.safetyScore - a.route.safetyScore ||
          a.route.distanceMeters - b.route.distanceMeters,
      )[0];
    if (fallback) {
      fallback.route.status = "ALTERNATIVE";
      fallback.route.riskReasons = [
        "모든 차량 경로가 지하차도를 통과해 최소 위험 경로 1개를 표시합니다. 현장 통제를 확인하세요.",
        ...fallback.route.riskReasons,
      ].slice(0, 3);
    }
  }

  return evaluated
    .map(({ route }) => route)
    .sort((a, b) => {
      if (a.status === "REJECTED" && b.status !== "REJECTED") return 1;
      if (a.status !== "REJECTED" && b.status === "REJECTED") return -1;
      if (b.safetyScore !== a.safetyScore) return b.safetyScore - a.safetyScore;
      return a.distanceMeters - b.distanceMeters;
    })
    .map((route, index) =>
      route.status === "REJECTED"
        ? route
        : {
            ...route,
            status: index === 0 ? "RECOMMENDED" : "ALTERNATIVE",
          },
    );
};
