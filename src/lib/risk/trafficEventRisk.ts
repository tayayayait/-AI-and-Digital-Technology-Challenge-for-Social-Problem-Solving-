import type { LatLng, TrafficEvent } from "@/lib/types";
import { haversineMeters } from "@/lib/utils";

export type TrafficEventSeverity = "BLOCKING" | "CAUTION" | "INFO";

const BLOCKING_KEYWORDS = ["침수", "통제", "차단", "재난", "호우", "홍수", "수위", "유실"];
const CAUTION_KEYWORDS = ["사고", "공사", "기상", "돌발", "정체", "서행"];

export const TRAFFIC_CONTROL_RADIUS_M = 1_000;

const trafficEventText = (event: TrafficEvent) =>
  [event.eventType, event.eventDetailType, event.lanesBlockType, event.lanesBlocked, event.message]
    .filter(Boolean)
    .join(" ");

export const classifyTrafficEvent = (event: TrafficEvent): TrafficEventSeverity => {
  const target = trafficEventText(event);
  if (BLOCKING_KEYWORDS.some((keyword) => target.includes(keyword))) return "BLOCKING";
  if (CAUTION_KEYWORDS.some((keyword) => target.includes(keyword))) return "CAUTION";
  return "INFO";
};

export const trafficEventReason = (event: TrafficEvent) => {
  const road = event.roadName ? `${event.roadName} ` : "";
  const detail = event.eventDetailType || event.eventType;
  return `${road}${detail || "돌발상황"} ${event.message}`.trim();
};

/** 현재 위치 반경 내에 통행 차단급 돌발상황이 있는지 판정한다. */
export const hasBlockingEventNearby = (
  events: TrafficEvent[],
  origin: LatLng,
  radiusMeters = TRAFFIC_CONTROL_RADIUS_M,
) =>
  events.some(
    (event) =>
      classifyTrafficEvent(event) === "BLOCKING" &&
      haversineMeters(origin, event.position) <= radiusMeters,
  );
