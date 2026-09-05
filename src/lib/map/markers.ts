import type { RiskLevel, Shelter, ShelterStatus, TrafficEvent } from "@/lib/types";
import { classifyTrafficEvent } from "@/lib/risk/trafficEventRisk";

export interface NaverHtmlMarkerIcon {
  content: string;
  size: unknown;
  anchor: unknown;
}

const SHELTER_STATUS_META: Record<ShelterStatus, { label: string; color: string; glyph: string }> =
  {
    OPERATING: { label: "운영중", color: "#2563eb", glyph: "S" },
    CHECK_REQUIRED: { label: "확인필요", color: "#ca8a04", glyph: "?" },
    EXCLUDED: { label: "제외권고", color: "#dc2626", glyph: "!" },
  };

const RISK_META: Record<Exclude<RiskLevel, "UNKNOWN">, { label: string; color: string }> = {
  SAFE: { label: "안전", color: "#166534" },
  WATCH: { label: "주의", color: "#854d0e" },
  WARNING: { label: "경계", color: "#9a3412" },
  CRITICAL: { label: "심각", color: "#991b1b" },
};

const TRAFFIC_EVENT_TYPE_META = [
  { keyword: "사고", label: "사고", color: "#ea580c" },
  { keyword: "공사", label: "공사", color: "#ca8a04" },
  { keyword: "기상", label: "기상", color: "#2563eb" },
  { keyword: "재난", label: "재난", color: "#dc2626" },
  { keyword: "돌발", label: "돌발", color: "#475569" },
] as const;

export function getShelterMarkerStatusLabel(status: ShelterStatus) {
  return SHELTER_STATUS_META[status].label;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function markerIcon(
  maps: NaverMapsNamespace["maps"],
  content: string,
  size: number,
): NaverHtmlMarkerIcon {
  return {
    content,
    size: new maps.Size(size, size),
    anchor: new maps.Point(size / 2, size / 2),
  };
}

export function createCurrentLocationMarkerIcon(
  maps: NaverMapsNamespace["maps"],
): NaverHtmlMarkerIcon {
  return markerIcon(
    maps,
    `<span class="a11y-map-marker" role="img" aria-label="현재 위치" style="
      display:block;width:18px;height:18px;border-radius:999px;
      border:3px solid #fff;background:#2563eb;
      box-shadow:0 1px 4px rgba(15,23,42,.24);
    "></span>`,
    18,
  );
}

export function createShelterMarkerIcon(
  maps: NaverMapsNamespace["maps"],
  shelter: Shelter,
): NaverHtmlMarkerIcon {
  const meta = SHELTER_STATUS_META[shelter.status];
  return markerIcon(
    maps,
    `<button class="a11y-map-marker" type="button" data-shelter-id="${escapeHtml(shelter.id)}" aria-label="대피소: ${escapeHtml(shelter.name)}, ${meta.label}" style="
      width:28px;height:28px;border-radius:999px;border:2px solid #fff;
      background:${meta.color};color:#fff;font-size:11px;font-weight:900;
      box-shadow:0 1px 4px rgba(15,23,42,.24);
    "><span aria-hidden="true">${meta.glyph}</span><span style="position:absolute;left:-9999px">${meta.label}</span></button>`,
    28,
  );
}

export function createRiskZoneMarkerIcon(
  maps: NaverMapsNamespace["maps"],
  level: Exclude<RiskLevel, "UNKNOWN">,
  label: string,
): NaverHtmlMarkerIcon {
  const meta = RISK_META[level];
  return markerIcon(
    maps,
    `<span class="a11y-map-marker" role="img" aria-label="위험지점: ${escapeHtml(label)}, ${meta.label}" style="
      display:flex;align-items:center;justify-content:center;width:32px;height:32px;
      transform:rotate(45deg);border:2px solid #fff;background:${meta.color};color:#fff;
      box-shadow:0 1px 4px rgba(15,23,42,.24);font-size:14px;font-weight:900;
    "><span aria-hidden="true" style="transform:rotate(-45deg)">!</span></span>`,
    32,
  );
}

export function createControlMarkerIcon(
  maps: NaverMapsNamespace["maps"],
  label: string,
): NaverHtmlMarkerIcon {
  return markerIcon(
    maps,
    `<span class="a11y-map-marker" role="img" aria-label="통제 정보: ${escapeHtml(label)}" style="
      display:flex;align-items:center;justify-content:center;width:28px;height:28px;
      border-radius:8px;border:2px solid #fff;background:#dc2626;color:#fff;
      box-shadow:0 1px 4px rgba(15,23,42,.24);font-size:14px;font-weight:900;
    ">!</span>`,
    28,
  );
}

export function createTrafficEventMarkerIcon(
  maps: NaverMapsNamespace["maps"],
  event: TrafficEvent,
): NaverHtmlMarkerIcon {
  const severity = classifyTrafficEvent(event);
  const matchedType = TRAFFIC_EVENT_TYPE_META.find(
    (meta) =>
      event.eventType.includes(meta.keyword) || event.eventDetailType?.includes(meta.keyword),
  );
  const label = severity === "BLOCKING" ? "통제" : (matchedType?.label ?? "돌발");
  const color = severity === "BLOCKING" ? "#dc2626" : (matchedType?.color ?? "#475569");

  return markerIcon(
    maps,
    `<button class="a11y-map-marker" type="button" data-traffic-event-id="${escapeHtml(event.id)}" aria-label="돌발상황: ${escapeHtml(event.message)}" style="
      display:flex;align-items:center;justify-content:center;min-width:34px;height:28px;
      border-radius:8px;border:2px solid #fff;background:${color};color:#fff;
      box-shadow:0 1px 5px rgba(15,23,42,.28);font-size:11px;font-weight:900;
      padding:0 6px;letter-spacing:0;
    ">${escapeHtml(label)}</button>`,
    34,
  );
}
