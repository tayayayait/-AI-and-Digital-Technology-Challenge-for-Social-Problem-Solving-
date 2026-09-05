import { handleCorsPreflight, jsonOk, withJsonDuration } from "../_shared/cors.ts";
import { assertAllowedMethod, parseJsonBody } from "../_shared/validation.ts";
import { edgeError, fetchJson } from "../_shared/upstream.ts";
import { readTrafficEventsApiKey } from "./apiKey.ts";
import { isSuccessfulItsResultCode, resultCodeText } from "./itsResult.ts";
import {
  isTrafficEventsUpstreamUnavailable,
  TRAFFIC_EVENTS_SOURCE,
  trafficEventsUnavailableBody,
} from "./upstreamFallback.ts";
import { fetchTrafficEventsWithRetry } from "./upstreamRetry.ts";

const SOURCE = TRAFFIC_EVENTS_SOURCE;
const API_URL = "https://openapi.its.go.kr:9443/eventInfo";
const TRAFFIC_EVENTS_UPSTREAM_TIMEOUT_MS = 15000;

interface LatLng {
  lat: number;
  lng: number;
}

interface TrafficEvent {
  id: string;
  type: string;
  eventType: string;
  eventDetailType?: string;
  position: LatLng;
  linkId?: string;
  roadName?: string;
  roadNo?: string;
  roadDirection?: string;
  lanesBlockType?: string;
  lanesBlocked?: string;
  message: string;
  startedAt?: string;
  endedAt?: string;
  source: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const numberValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseCenterRequest = (value: unknown) => {
  if (!isRecord(value) || !isRecord(value.center)) throw new Error("Invalid request body");
  const lat = numberValue(value.center.lat);
  const lng = numberValue(value.center.lng);
  if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error("Invalid center");
  }

  const radiusMeters = numberValue(value.radiusMeters) ?? 5000;
  return {
    center: { lat, lng },
    radiusMeters: Math.min(Math.max(radiusMeters, 500), 20000),
  };
};

const toBoundingBox = ({ center, radiusMeters }: { center: LatLng; radiusMeters: number }) => {
  const latDelta = radiusMeters / 111_320;
  const lngDelta = radiusMeters / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  return {
    minX: center.lng - lngDelta,
    maxX: center.lng + lngDelta,
    minY: center.lat - latDelta,
    maxY: center.lat + latDelta,
  };
};

const toArray = (value: unknown): Record<string, unknown>[] => {
  if (!value) return [];
  const rows = Array.isArray(value) ? value : [value];
  return rows.filter(isRecord);
};

const formatItsTimestamp = (value: unknown) => {
  const raw = text(value);
  if (!/^\d{14}$/.test(raw)) return undefined;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}+09:00`;
};

const isEnded = (endedAt?: string) => {
  if (!endedAt) return false;
  const timestamp = new Date(endedAt).getTime();
  return Number.isFinite(timestamp) && timestamp < Date.now();
};

const normalizeEvent = (item: Record<string, unknown>, index: number): TrafficEvent | null => {
  const lng = numberValue(item.coordX);
  const lat = numberValue(item.coordY);
  if (lat == null || lng == null) return null;

  const endedAt = formatItsTimestamp(item.endDate);
  if (isEnded(endedAt)) return null;

  const linkId = text(item.linkId);
  const startedAt = formatItsTimestamp(item.startDate);
  const message = text(item.message);
  const roadName = text(item.roadName);
  const eventType = text(item.eventType) || "확실한 정보 없음";

  return {
    id: [linkId, text(item.startDate), lng, lat, index].filter(Boolean).join(":"),
    type: text(item.type) || "확실한 정보 없음",
    eventType,
    eventDetailType: text(item.eventDetailType) || undefined,
    position: { lat, lng },
    linkId: linkId || undefined,
    roadName: roadName || undefined,
    roadNo: text(item.roadNo) || undefined,
    roadDirection: text(item.roadDrcType) || undefined,
    lanesBlockType: text(item.lanesBlockType) || undefined,
    lanesBlocked: text(item.lanesBlocked) || undefined,
    message: message || `${roadName} ${eventType}`.trim(),
    startedAt,
    endedAt,
    source: SOURCE,
  };
};

Deno.serve(
  withJsonDuration(async (request) => {
    const preflight = handleCorsPreflight(request);
    if (preflight) return preflight;

    try {
      assertAllowedMethod(request.method, ["POST"]);
      const input = parseCenterRequest(await parseJsonBody(request));
      const apiKey = readTrafficEventsApiKey((name) => Deno.env.get(name));
      if (!apiKey) {
        return jsonOk(trafficEventsUnavailableBody("ITS_API_KEY is not configured"));
      }

      const bounds = toBoundingBox(input);

      const url = new URL(API_URL);
      url.searchParams.set("apiKey", apiKey);
      url.searchParams.set("type", "all");
      url.searchParams.set("eventType", "all");
      url.searchParams.set("minX", bounds.minX.toFixed(6));
      url.searchParams.set("maxX", bounds.maxX.toFixed(6));
      url.searchParams.set("minY", bounds.minY.toFixed(6));
      url.searchParams.set("maxY", bounds.maxY.toFixed(6));
      url.searchParams.set("getType", "json");

      const upstream = await fetchTrafficEventsWithRetry(() =>
        fetchJson(url, undefined, {
          timeoutMs: TRAFFIC_EVENTS_UPSTREAM_TIMEOUT_MS,
          timeoutMessage: "ITS eventInfo request timed out",
        }),
      );
      if (!isRecord(upstream)) throw new Error("Invalid ITS response");

      const header = upstream.header;
      if (isRecord(header) && !isSuccessfulItsResultCode(header.resultCode)) {
        throw new Error(
          `ITS API error: ${text(header.resultMsg) || resultCodeText(header.resultCode) || "unknown"}`,
        );
      }

      const body = upstream.body;
      const itemsRaw = isRecord(body) ? body.items : undefined;
      const items = toArray(isRecord(itemsRaw) ? (itemsRaw.item ?? itemsRaw) : itemsRaw);
      const events = items
        .map((item, index) => normalizeEvent(item, index))
        .filter((event): event is TrafficEvent => event != null);

      return jsonOk({ events, source: SOURCE, status: "OK" });
    } catch (error) {
      if (isTrafficEventsUpstreamUnavailable(error)) {
        const message = error instanceof Error ? error.message : "ITS eventInfo unavailable";
        return jsonOk(trafficEventsUnavailableBody(message));
      }

      return edgeError(error);
    }
  }),
);
